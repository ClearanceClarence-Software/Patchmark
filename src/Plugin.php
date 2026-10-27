<?php
/**
 * Hooks into the "This plugin is already installed" screen.
 *
 * @package Patchmark
 */

namespace ClearanceClarence\Patchmark;

defined( 'ABSPATH' ) || exit;

/**
 * When a zip is uploaded for a plugin that is already installed, WordPress unpacks it, notices
 * the folder exists, deletes the unpacked files and shows a comparison table. The review is
 * built in the short window while both copies are on disk, kept for the rest of the request,
 * and handed to the viewer with the table.
 */
final class Plugin {

	const HANDLE = 'patchmark';

	/**
	 * The review built during this request.
	 *
	 * @var array|null
	 */
	private static $report = null;

	/**
	 * Hooks.
	 */
	public static function boot() {
		// Late, so a plugin that renames the unpacked folder (common for GitHub zips) has run.
		add_filter( 'upgrader_source_selection', array( self::class, 'capture' ), 999, 4 );
		add_filter( 'install_plugin_overwrite_comparison', array( self::class, 'render' ), 10, 3 );
		add_action( 'admin_enqueue_scripts', array( self::class, 'styles' ) );
	}

	/**
	 * The stylesheet, in the head of the upload screen. WordPress prints scripts enqueued while
	 * the page renders, but not stylesheets, so this one is added up front. It is small and
	 * only loads on update.php while a plugin zip is being installed.
	 *
	 * @param string $hook_suffix Screen.
	 */
	public static function styles( $hook_suffix ) {
		// Only reads which screen this is; nothing is changed, so there is no nonce to check.
		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( $_GET['action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( 'update.php' !== $hook_suffix || 'upload-plugin' !== $action ) {
			return;
		}
		$asset = self::asset();
		if ( null === $asset ) {
			return;
		}
		wp_enqueue_style( self::HANDLE, PATCHMARK_URL . 'build/index.css', array(), $asset['version'] );
		wp_style_add_data( self::HANDLE, 'rtl', 'replace' );
	}

	/**
	 * Build metadata, or null when the plugin was not built.
	 *
	 * @return array|null
	 */
	private static function asset() {
		$file = PATCHMARK_DIR . 'build/index.asset.php';
		return is_readable( $file ) ? require $file : null;
	}

	/**
	 * Runs after the zip is unpacked and before WordPress finds that the folder exists.
	 *
	 * @param string|\WP_Error $source        Unpacked folder.
	 * @param string           $remote_source Working folder.
	 * @param \WP_Upgrader     $upgrader      Upgrader.
	 * @param array            $hook_extra    Context.
	 * @return string|\WP_Error Unchanged.
	 */
	public static function capture( $source, $remote_source, $upgrader, $hook_extra = array() ) {
		global $wp_filesystem;

		if ( is_wp_error( $source ) || ! ( $upgrader instanceof \Plugin_Upgrader ) || ! $wp_filesystem ) {
			return $source;
		}
		if ( empty( $hook_extra['type'] ) || 'plugin' !== $hook_extra['type'] || empty( $hook_extra['action'] ) || 'install' !== $hook_extra['action'] ) {
			return $source;
		}
		// After "Replace current with uploaded" the comparison screen is not shown again.
		if ( isset( $upgrader->skin->overwrite ) && '' !== (string) $upgrader->skin->overwrite ) {
			return $source;
		}

		// The same local path WordPress's own package check reads from.
		$local  = str_replace( $wp_filesystem->wp_content_dir(), trailingslashit( WP_CONTENT_DIR ), untrailingslashit( (string) $source ) );
		$folder = basename( $local );
		if ( ! is_dir( $local ) || ! is_dir( WP_PLUGIN_DIR . '/' . $folder ) ) {
			return $source; // A single-file package, or a fresh install: no comparison screen.
		}

		try {
			self::$report = self::build( $local, WP_PLUGIN_DIR . '/' . $folder, $folder, (array) $upgrader->new_plugin_data );
		} catch ( \Throwable $e ) {
			// The review is a courtesy: it must never stand in the way of the upload itself.
			self::$report = array( 'error' => $e->getMessage() );
		}

		return $source;
	}

	/**
	 * Builds the review.
	 *
	 * @param string $upload    Unpacked upload.
	 * @param string $installed Installed folder.
	 * @param string $folder    Folder name.
	 * @param array  $uploaded  Uploaded header data, when WordPress has read it.
	 * @return array
	 */
	public static function build( $upload, $installed, $folder, array $uploaded = array() ) {
		$started = microtime( true );

		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$plugin_file = '';
		$current     = array();
		foreach ( get_plugins() as $file => $data ) {
			if ( 0 === strpos( $file, $folder . '/' ) ) {
				$plugin_file = $file;
				$current     = $data;
				break;
			}
		}

		$old = new Package( $installed );
		$new = new Package( $upload );
		if ( ! $current ) {
			$main        = $old->main_file();
			$current     = '' !== $main ? $old->plugin_data( $main ) : array();
			$plugin_file = '' !== $main ? $folder . '/' . $main : '';
		}
		if ( ! $uploaded ) {
			$main     = $new->main_file();
			$uploaded = '' !== $main ? $new->plugin_data( $main ) : array();
		}

		$cmp       = new Comparison( $old, $new );
		$review    = new Review( $cmp, $current, $uploaded, $plugin_file );
		$payload   = $cmp->payload();
		$old_v     = isset( $current['Version'] ) ? (string) $current['Version'] : '';
		$new_v     = isset( $uploaded['Version'] ) ? (string) $uploaded['Version'] : '';
		$findings  = $review->findings();
		$api       = $review->api();
		$changelog = Changelog::between( $old, $new, $old_v, $new_v );

		return array(
			'version'   => PATCHMARK_VERSION,
			'plugin'    => array(
				'name'       => isset( $uploaded['Name'] ) ? (string) $uploaded['Name'] : $folder,
				'folder'     => $folder,
				'oldVersion' => $old_v,
				'newVersion' => $new_v,
			),
			'counts'    => $cmp->counts(),
			'bytes'     => array(
				'old' => array_sum( wp_list_pluck( $old->files(), 'size' ) ),
				'new' => array_sum( wp_list_pluck( $new->files(), 'size' ) ),
			),
			'truncated' => $old->truncated() || $new->truncated(),
			'omitted'   => $payload['omitted'],
			'findings'  => $findings,
			'changelog' => $changelog,
			'api'       => $api,
			'files'     => $payload['files'],
			'ms'        => (int) round( ( microtime( true ) - $started ) * 1000 ),
		);
	}

	/**
	 * Adds header rows to WordPress's table and the viewer below it.
	 *
	 * @param string $table    Table HTML from WordPress.
	 * @param array  $current  Installed header data.
	 * @param array  $uploaded Uploaded header data.
	 * @return string
	 */
	public static function render( $table, $current, $uploaded ) {
		$table = self::header_rows( (string) $table, (array) $current, (array) $uploaded );

		if ( null === self::$report ) {
			return $table;
		}

		if ( isset( self::$report['error'] ) ) {
			return $table . '<div class="notice notice-warning inline"><p>' . esc_html(
				sprintf(
					/* translators: %s: error message. */
					__( 'Patchmark could not compare the files: %s', 'patchmark' ),
					self::$report['error']
				)
			) . '</p></div>';
		}

		// The full header comparison travels with the review, so the viewer can replace
		// WordPress's table when it takes over the page.
		self::$report['headers'] = self::header_compare( (array) $current, (array) $uploaded, true );
		self::enqueue();

		$c       = self::$report['counts'];
		$changed = $c['added'] + $c['removed'] + $c['renamed'] + $c['modified'];
		$summary = sprintf(
			/* translators: 1: changed files, 2: unchanged files, 3: findings. */
			__( '%1$d files changed, %2$d unchanged, %3$d findings. Turn on JavaScript to see the details.', 'patchmark' ),
			$changed,
			$c['unchanged'],
			count( self::$report['findings'] )
		);

		return $table
			. '<div id="patchmark" class="pmk-mount"><p class="pmk-loading">' . esc_html__( 'Loading the comparison…', 'patchmark' ) . '</p></div>'
			. '<noscript><p>' . esc_html( $summary ) . '</p></noscript>';
	}

	/**
	 * The script, with the review as data. Enqueued while the page renders, so it prints in the
	 * footer, and only when there is something to show.
	 */
	private static function enqueue() {
		$asset = self::asset();
		if ( null === $asset ) {
			return;
		}

		wp_enqueue_script( self::HANDLE, PATCHMARK_URL . 'build/index.js', $asset['dependencies'], $asset['version'], true );
		wp_set_script_translations( self::HANDLE, 'patchmark' );

		// JSON_HEX_TAG keeps "</script>" inside a diffed file from closing the tag.
		$json = wp_json_encode( self::$report, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE );
		wp_add_inline_script( self::HANDLE, 'window.patchmarkReport = ' . ( false === $json ? 'null' : $json ) . ';', 'before' );
	}

	/**
	 * Header fields side by side.
	 *
	 * @param array $current  Installed header data.
	 * @param array $uploaded Uploaded header data.
	 * @param bool  $all      Include the fields WordPress's own table already shows.
	 * @return array<int, array{key: string, label: string, current: string, uploaded: string}>
	 */
	private static function header_compare( array $current, array $uploaded, $all ) {
		$fields = array();
		if ( $all ) {
			$fields = array(
				'Name'        => __( 'Plugin name', 'patchmark' ),
				'Version'     => __( 'Version', 'patchmark' ),
				'Author'      => __( 'Author', 'patchmark' ),
				'RequiresWP'  => __( 'Requires WordPress', 'patchmark' ),
				'RequiresPHP' => __( 'Requires PHP', 'patchmark' ),
			);
		}
		$fields += array(
			'Description'     => __( 'Description', 'patchmark' ),
			'PluginURI'       => __( 'Plugin URI', 'patchmark' ),
			'AuthorURI'       => __( 'Author URI', 'patchmark' ),
			'UpdateURI'       => __( 'Update URI', 'patchmark' ),
			'TextDomain'      => __( 'Text domain', 'patchmark' ),
			'RequiresPlugins' => __( 'Requires plugins', 'patchmark' ),
			'Network'         => __( 'Network only', 'patchmark' ),
		);

		$rows = array();
		foreach ( $fields as $key => $label ) {
			$a = isset( $current[ $key ] ) ? $current[ $key ] : '';
			$b = isset( $uploaded[ $key ] ) ? $uploaded[ $key ] : '';
			if ( is_bool( $a ) || is_bool( $b ) ) {
				$a = $a ? __( 'Yes', 'patchmark' ) : __( 'No', 'patchmark' );
				$b = $b ? __( 'Yes', 'patchmark' ) : __( 'No', 'patchmark' );
			}
			$a = trim( wp_strip_all_tags( (string) $a ) );
			$b = trim( wp_strip_all_tags( (string) $b ) );
			if ( ( '' === $a && '' === $b ) || ( 'Network' === $key && $a === $b ) ) {
				continue;
			}
			$rows[] = array(
				'key'      => $key,
				'label'    => $label,
				'current'  => $a,
				'uploaded' => $b,
			);
		}
		return $rows;
	}

	/**
	 * Header fields WordPress leaves out of its table, added to it. This is what shows when the
	 * viewer can't run.
	 *
	 * @param string $table    Table HTML.
	 * @param array  $current  Installed header data.
	 * @param array  $uploaded Uploaded header data.
	 * @return string
	 */
	private static function header_rows( $table, array $current, array $uploaded ) {
		$rows = '';
		foreach ( self::header_compare( $current, $uploaded, false ) as $row ) {
			$rows .= sprintf(
				'<tr><td class="name-label">%s</td><td>%s</td><td%s>%s</td></tr>',
				esc_html( $row['label'] ),
				esc_html( '' !== $row['current'] ? $row['current'] : '-' ),
				$row['current'] !== $row['uploaded'] ? ' class="warning"' : '',
				esc_html( '' !== $row['uploaded'] ? $row['uploaded'] : '-' )
			);
		}

		$pos = strrpos( $table, '</tbody>' );
		if ( '' === $rows || false === $pos ) {
			return $table;
		}
		return substr_replace( $table, $rows . '</tbody>', $pos, strlen( '</tbody>' ) );
	}
}
