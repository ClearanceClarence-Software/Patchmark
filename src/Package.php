<?php
/**
 * One side of the comparison: the installed plugin folder, or the unpacked upload.
 *
 * @package UploadDiff
 */

namespace ClearanceClarence\UploadDiff;

defined( 'ABSPATH' ) || exit;

/**
 * Lists files with their size and hash, and reads contents only when asked.
 *
 * Both folders are on the local disk while the upload is being checked (core's own package
 * check reads the unpacked upload the same way), so the direct filesystem class is used and
 * files are hashed without being loaded into memory.
 */
final class Package {

	/**
	 * Most files listed. Anything past this is left out and reported.
	 */
	const MAX_FILES = 20000;

	/**
	 * Most bytes kept in the read cache.
	 */
	const CACHE_BYTES = 24 * 1024 * 1024;

	/**
	 * Folder, with a trailing slash.
	 *
	 * @var string
	 */
	private $root;

	/**
	 * Filesystem.
	 *
	 * @var \WP_Filesystem_Direct
	 */
	private $fs;

	/**
	 * Relative path => array{size: int, hash: string}.
	 *
	 * @var array|null
	 */
	private $files = null;

	/**
	 * Whether the listing hit MAX_FILES.
	 *
	 * @var bool
	 */
	private $truncated = false;

	/**
	 * Contents read so far.
	 *
	 * @var array<string, string>
	 */
	private $cache = array();

	/**
	 * Bytes in the cache.
	 *
	 * @var int
	 */
	private $cached = 0;

	/**
	 * Constructor.
	 *
	 * @param string $root Local folder.
	 */
	public function __construct( $root ) {
		$this->root = trailingslashit( $root );
		$this->fs   = self::filesystem();
	}

	/**
	 * Local folder, with a trailing slash.
	 *
	 * @return string
	 */
	public function root() {
		return $this->root;
	}

	/**
	 * Files by relative path, sorted.
	 *
	 * @return array<string, array{size: int, hash: string}>
	 */
	public function files() {
		if ( null === $this->files ) {
			$this->files = array();
			$list        = $this->fs->dirlist( $this->root, true, true );
			$this->walk( is_array( $list ) ? $list : array(), '' );
			ksort( $this->files, SORT_STRING );
		}
		return $this->files;
	}

	/**
	 * Whether some files were left out.
	 *
	 * @return bool
	 */
	public function truncated() {
		$this->files();
		return $this->truncated;
	}

	/**
	 * Whether a file exists in this package.
	 *
	 * @param string $rel Relative path.
	 * @return bool
	 */
	public function has( $rel ) {
		return isset( $this->files()[ $rel ] );
	}

	/**
	 * Size of a file.
	 *
	 * @param string $rel Relative path.
	 * @return int
	 */
	public function size( $rel ) {
		$files = $this->files();
		return isset( $files[ $rel ] ) ? $files[ $rel ]['size'] : 0;
	}

	/**
	 * Contents of a file, or null when it is missing, unreadable or larger than $max bytes.
	 *
	 * @param string $rel Relative path.
	 * @param int    $max Largest size read.
	 * @return string|null
	 */
	public function read( $rel, $max = 4194304 ) {
		if ( isset( $this->cache[ $rel ] ) ) {
			return $this->cache[ $rel ];
		}
		if ( ! $this->has( $rel ) || $this->size( $rel ) > $max ) {
			return null;
		}
		$body = $this->fs->get_contents( $this->root . $rel );
		if ( false === $body ) {
			return null;
		}
		if ( $this->cached + strlen( $body ) <= self::CACHE_BYTES ) {
			$this->cache[ $rel ] = $body;
			$this->cached       += strlen( $body );
		}
		return $body;
	}

	/**
	 * Plugin header data for a file in this package.
	 *
	 * @param string $rel Relative path.
	 * @return array
	 */
	public function plugin_data( $rel ) {
		if ( ! function_exists( 'get_plugin_data' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		return get_plugin_data( $this->root . $rel, false, false );
	}

	/**
	 * The main plugin file: the first top-level PHP file with a Plugin Name header, the same
	 * rule WordPress uses.
	 *
	 * @return string Relative path, or '' when there is none.
	 */
	public function main_file() {
		foreach ( array_keys( $this->files() ) as $rel ) {
			if ( false === strpos( $rel, '/' ) && '.php' === strtolower( substr( $rel, -4 ) ) ) {
				$data = $this->plugin_data( $rel );
				if ( ! empty( $data['Name'] ) ) {
					return $rel;
				}
			}
		}
		return '';
	}

	/**
	 * Walks a dirlist() tree.
	 *
	 * @param array  $entries Entries.
	 * @param string $prefix  Relative folder, with a trailing slash.
	 */
	private function walk( array $entries, $prefix ) {
		/**
		 * Filters file and folder names left out of the comparison. The defaults cover clutter
		 * from a working copy, such as a git checkout on a local site.
		 *
		 * @param string[] $names Names.
		 */
		$ignore = (array) apply_filters( 'ccs_upload_diff_ignore', array( '.git', '.svn', '.hg', '.idea', '.vscode', 'node_modules', '.DS_Store', 'Thumbs.db', '__MACOSX' ) );

		foreach ( $entries as $name => $info ) {
			$name = (string) $name;
			if ( in_array( $name, $ignore, true ) ) {
				continue;
			}
			$rel = $prefix . $name;

			if ( isset( $info['type'] ) && 'd' === $info['type'] ) {
				$this->walk( isset( $info['files'] ) ? (array) $info['files'] : array(), $rel . '/' );
				continue;
			}

			if ( count( $this->files ) >= self::MAX_FILES ) {
				$this->truncated = true;
				return;
			}

			$path                = $this->root . $rel;
			$hash                = md5_file( $path );
			$this->files[ $rel ] = array(
				'size' => isset( $info['size'] ) ? (int) $info['size'] : (int) $this->fs->size( $path ),
				'hash' => false === $hash ? '' : $hash,
			);
		}
	}

	/**
	 * The direct filesystem class.
	 *
	 * @return \WP_Filesystem_Direct
	 */
	private static function filesystem() {
		static $fs = null;
		if ( null === $fs ) {
			require_once ABSPATH . 'wp-admin/includes/class-wp-filesystem-base.php';
			require_once ABSPATH . 'wp-admin/includes/class-wp-filesystem-direct.php';
			$fs = new \WP_Filesystem_Direct( null );
		}
		return $fs;
	}
}
