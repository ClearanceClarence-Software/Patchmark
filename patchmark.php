<?php
/**
 * Plugin Name:       Patchmark
 * Plugin URI:        https://github.com/ClearanceClarence-Software/Patchmark
 * Description:       See exactly what a plugin zip changes before it replaces the installed copy: files, risky code, changelog and removed functions.
 * Version:           1.0.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            CC Software
 * Author URI:        https://github.com/ClearanceClarence-Software
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       patchmark
 *
 * @package Patchmark
 */

defined( 'ABSPATH' ) || exit;

define( 'PATCHMARK_VERSION', '1.0.0' );
define( 'PATCHMARK_FILE', __FILE__ );
define( 'PATCHMARK_DIR', plugin_dir_path( __FILE__ ) );
define( 'PATCHMARK_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( $class_name ) {
		$prefix = 'ClearanceClarence\\Patchmark\\';
		if ( 0 !== strpos( $class_name, $prefix ) ) {
			return;
		}
		$relative = str_replace( '\\', '/', substr( $class_name, strlen( $prefix ) ) );
		$file     = PATCHMARK_DIR . 'src/' . $relative . '.php';
		if ( is_readable( $file ) ) {
			require $file;
		}
	}
);

// Everything happens on the plugin upload screen, so nothing else is loaded on other requests.
if ( is_admin() ) {
	ClearanceClarence\Patchmark\Plugin::boot();
}
