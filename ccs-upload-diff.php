<?php
/**
 * Plugin Name:       Upload Diff
 * Plugin URI:        https://github.com/ClearanceClarence-Software/Upload-Diff
 * Description:       See exactly what a plugin zip changes before it replaces the installed copy: files, risky code, changelog and removed functions.
 * Version:           1.0.0
 * Requires at least: 6.6
 * Requires PHP:      7.4
 * Author:            CC Software
 * Author URI:        https://github.com/ClearanceClarence-Software
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       ccs-upload-diff
 *
 * @package UploadDiff
 */

defined( 'ABSPATH' ) || exit;

define( 'CCS_UPLOAD_DIFF_VERSION', '1.0.0' );
define( 'CCS_UPLOAD_DIFF_FILE', __FILE__ );
define( 'CCS_UPLOAD_DIFF_DIR', plugin_dir_path( __FILE__ ) );
define( 'CCS_UPLOAD_DIFF_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( $class_name ) {
		$prefix = 'ClearanceClarence\\UploadDiff\\';
		if ( 0 !== strpos( $class_name, $prefix ) ) {
			return;
		}
		$relative = str_replace( '\\', '/', substr( $class_name, strlen( $prefix ) ) );
		$file     = CCS_UPLOAD_DIFF_DIR . 'src/' . $relative . '.php';
		if ( is_readable( $file ) ) {
			require $file;
		}
	}
);

// Everything happens on the plugin upload screen, so nothing else is loaded on other requests.
if ( is_admin() ) {
	ClearanceClarence\UploadDiff\Plugin::boot();
}
