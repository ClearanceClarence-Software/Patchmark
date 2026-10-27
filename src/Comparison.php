<?php
/**
 * File-by-file comparison of two packages.
 *
 * @package UploadDiff
 */

namespace ClearanceClarence\UploadDiff;

defined( 'ABSPATH' ) || exit;

/**
 * Sorts every file into added, removed, renamed, modified, whitespace-only or unchanged, and
 * decides which contents travel to the viewer.
 */
final class Comparison {

	/**
	 * Extensions always treated as text.
	 */
	const TEXT_EXT = array( 'php', 'phtml', 'inc', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'css', 'scss', 'sass', 'less', 'json', 'txt', 'md', 'markdown', 'html', 'htm', 'xml', 'svg', 'pot', 'po', 'yml', 'yaml', 'ini', 'sql', 'twig', 'csv', 'tsv', 'lock', 'map', 'htaccess', 'conf', 'neon', 'dist', 'sh', 'bat', 'ps1', 'vue', 'svelte', 'mustache', 'hbs', 'tpl', 'rst', 'log', 'env' );

	/**
	 * Extensions never treated as text.
	 */
	const BINARY_EXT = array( 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'phar', 'mo', 'pdf', 'mp3', 'mp4', 'webm', 'ogg', 'wav', 'exe', 'dll', 'so', 'dylib', 'jar', 'class', 'wasm' );

	/**
	 * Images shown side by side.
	 */
	const IMAGE_MIME = array(
		'png'  => 'image/png',
		'jpg'  => 'image/jpeg',
		'jpeg' => 'image/jpeg',
		'gif'  => 'image/gif',
		'webp' => 'image/webp',
		'svg'  => 'image/svg+xml',
		'ico'  => 'image/x-icon',
	);

	/**
	 * Largest text file sent to the viewer, per side.
	 */
	const MAX_TEXT = 524288;

	/**
	 * Largest image sent to the viewer, per side.
	 */
	const MAX_IMAGE = 262144;

	/**
	 * Most bytes of contents sent to the viewer in total.
	 */
	const BUDGET = 8 * 1024 * 1024;

	/**
	 * Installed package.
	 *
	 * @var Package
	 */
	public $old;

	/**
	 * Uploaded package.
	 *
	 * @var Package
	 */
	public $new;

	/**
	 * Entries: path, status, oldPath, oldSize, newSize, kind.
	 *
	 * @var array[]
	 */
	public $entries = array();

	/**
	 * Files with the same contents.
	 *
	 * @var int
	 */
	public $unchanged = 0;

	/**
	 * Constructor.
	 *
	 * @param Package $installed Installed.
	 * @param Package $uploaded  Uploaded.
	 */
	public function __construct( Package $installed, Package $uploaded ) {
		$this->old = $installed;
		$this->new = $uploaded;
		$this->compare();
	}

	/**
	 * Counts per status.
	 *
	 * @return array<string, int>
	 */
	public function counts() {
		$counts = array_fill_keys( array( 'added', 'removed', 'renamed', 'modified', 'whitespace' ), 0 );
		foreach ( $this->entries as $entry ) {
			++$counts[ $entry['status'] ];
		}
		$counts['unchanged'] = $this->unchanged;
		return $counts;
	}

	/**
	 * Files that changed, by status.
	 *
	 * @param string ...$statuses Statuses.
	 * @return array[]
	 */
	public function with_status( ...$statuses ) {
		return array_values(
			array_filter(
				$this->entries,
				static function ( $entry ) use ( $statuses ) {
					return in_array( $entry['status'], $statuses, true );
				}
			)
		);
	}

	/**
	 * Entries for the viewer, with contents attached within the budget. Modified files come
	 * first, then added, whitespace-only and removed, so the most useful diffs are never the ones
	 * left out.
	 *
	 * @return array{files: array[], omitted: int}
	 */
	public function payload() {
		$order   = array(
			'modified'   => 0,
			'added'      => 1,
			'renamed'    => 2,
			'whitespace' => 3,
			'removed'    => 4,
		);
		$queue   = $this->entries;
		$budget  = self::BUDGET;
		$omitted = 0;
		$out     = array();

		uasort(
			$queue,
			static function ( $a, $b ) use ( $order ) {
				return $order[ $a['status'] ] <=> $order[ $b['status'] ];
			}
		);

		foreach ( $queue as $index => $entry ) {
			$item = $entry;
			$ext  = self::ext( $entry['path'] );

			$old_rel = 'added' === $entry['status'] ? null : $entry['oldPath'];
			$new_rel = 'removed' === $entry['status'] ? null : $entry['path'];

			if ( 'text' === $entry['kind'] && 'renamed' !== $entry['status'] ) {
				$old  = null === $old_rel ? '' : $this->old->read( $old_rel, self::MAX_TEXT );
				$new  = null === $new_rel ? '' : $this->new->read( $new_rel, self::MAX_TEXT );
				$cost = strlen( (string) $old ) + strlen( (string) $new );
				if ( null === $old || null === $new ) {
					$item['note'] = 'large';
				} elseif ( $cost > $budget ) {
					$item['note'] = 'budget';
					++$omitted;
				} else {
					$item['old'] = self::utf8( $old );
					$item['new'] = self::utf8( $new );
					$budget     -= $cost;
				}
			}

			if ( isset( self::IMAGE_MIME[ $ext ] ) ) {
				foreach ( array(
					'oldImage' => array( $this->old, $old_rel ),
					'newImage' => array( $this->new, $new_rel ),
				) as $key => $side ) {
					if ( null === $side[1] ) {
						continue;
					}
					$body = $side[0]->read( $side[1], self::MAX_IMAGE );
					if ( null !== $body && strlen( $body ) * 1.4 < $budget ) {
						// Shown in an <img>, never inline, so an SVG cannot run scripts.
						$item[ $key ] = 'data:' . self::IMAGE_MIME[ $ext ] . ';base64,' . base64_encode( $body ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Image preview data URI.
						$budget      -= (int) ( strlen( $body ) * 1.4 );
					}
				}
			}

			$out[ $index ] = $item;
		}

		ksort( $out );
		return array(
			'files'   => array_values( $out ),
			'omitted' => $omitted,
		);
	}

	/**
	 * Whether a file is text, from its extension or, for unknown extensions, its first bytes.
	 *
	 * @param Package $package Package.
	 * @param string  $rel     Relative path.
	 * @return bool
	 */
	public static function is_text( Package $package, $rel ) {
		$ext  = self::ext( $rel );
		$base = strtolower( basename( $rel ) );
		if ( in_array( $ext, self::TEXT_EXT, true ) || in_array( $base, array( 'license', 'readme', 'changelog', 'makefile', 'dockerfile', '.htaccess', '.user.ini', '.gitignore', '.distignore', '.editorconfig' ), true ) ) {
			return true;
		}
		if ( in_array( $ext, self::BINARY_EXT, true ) ) {
			return false;
		}
		$head = $package->read( $rel, 2097152 );
		return null !== $head && false === strpos( substr( $head, 0, 8000 ), "\0" );
	}

	/**
	 * Lowercase extension.
	 *
	 * @param string $rel Path.
	 * @return string
	 */
	public static function ext( $rel ) {
		return strtolower( (string) pathinfo( $rel, PATHINFO_EXTENSION ) );
	}

	/**
	 * Builds the entries.
	 */
	private function compare() {
		$old_files = $this->old->files();
		$new_files = $this->new->files();
		$added     = array();
		$removed   = array();

		foreach ( $new_files as $rel => $file ) {
			if ( ! isset( $old_files[ $rel ] ) ) {
				$added[ $rel ] = $file;
				continue;
			}
			$prev = $old_files[ $rel ];
			if ( $prev['hash'] === $file['hash'] && $prev['size'] === $file['size'] ) {
				++$this->unchanged;
				continue;
			}

			$text   = self::is_text( $this->new, $rel ) && self::is_text( $this->old, $rel );
			$status = 'modified';
			if ( $text ) {
				$a = $this->old->read( $rel );
				$b = $this->new->read( $rel );
				if ( null !== $a && null !== $b && self::normalize( $a ) === self::normalize( $b ) ) {
					$status = 'whitespace';
				}
			}
			$this->entries[] = $this->entry( $rel, $status, $rel, $prev['size'], $file['size'], $text ? 'text' : self::binary_kind( $rel ) );
		}

		foreach ( $old_files as $rel => $file ) {
			if ( ! isset( $new_files[ $rel ] ) ) {
				$removed[ $rel ] = $file;
			}
		}

		// A removed file whose exact contents show up under a new name was moved.
		$by_hash = array();
		foreach ( $removed as $rel => $file ) {
			if ( $file['size'] > 0 ) {
				$by_hash[ $file['hash'] . ':' . $file['size'] ][] = $rel;
			}
		}
		foreach ( $added as $rel => $file ) {
			$key = $file['hash'] . ':' . $file['size'];
			if ( ! empty( $by_hash[ $key ] ) ) {
				$from = array_shift( $by_hash[ $key ] );
				unset( $removed[ $from ] );
				$this->entries[] = $this->entry( $rel, 'renamed', $from, $file['size'], $file['size'], self::kind( $this->new, $rel ) );
				continue;
			}
			$this->entries[] = $this->entry( $rel, 'added', null, null, $file['size'], self::kind( $this->new, $rel ) );
		}
		foreach ( $removed as $rel => $file ) {
			$this->entries[] = $this->entry( $rel, 'removed', $rel, $file['size'], null, self::kind( $this->old, $rel ) );
		}

		usort(
			$this->entries,
			static function ( $a, $b ) {
				return strcmp( $a['path'], $b['path'] );
			}
		);
	}

	/**
	 * One entry.
	 *
	 * @param string      $path     Path in the upload (or the installed path for removed files).
	 * @param string      $status   Status.
	 * @param string|null $old_path Path in the installed copy.
	 * @param int|null    $old_size Installed size.
	 * @param int|null    $new_size Uploaded size.
	 * @param string      $kind     text, image or binary.
	 * @return array
	 */
	private function entry( $path, $status, $old_path, $old_size, $new_size, $kind ) {
		return array(
			'path'    => (string) $path,
			'status'  => $status,
			'oldPath' => null === $old_path ? null : (string) $old_path,
			'oldSize' => $old_size,
			'newSize' => $new_size,
			'kind'    => $kind,
		);
	}

	/**
	 * Kind of file: text, image or binary.
	 *
	 * @param Package $package Package.
	 * @param string  $rel     Path.
	 * @return string
	 */
	private static function kind( Package $package, $rel ) {
		return self::is_text( $package, $rel ) ? 'text' : self::binary_kind( $rel );
	}

	/**
	 * Kind of binary file: image or binary.
	 *
	 * @param string $rel Path.
	 * @return string
	 */
	private static function binary_kind( $rel ) {
		return isset( self::IMAGE_MIME[ self::ext( $rel ) ] ) ? 'image' : 'binary';
	}

	/**
	 * Line endings and trailing whitespace removed.
	 *
	 * @param string $text Text.
	 * @return string
	 */
	private static function normalize( $text ) {
		return (string) preg_replace( '/[ \t]+$/m', '', str_replace( array( "\r\n", "\r" ), "\n", $text ) );
	}

	/**
	 * Valid UTF-8 for JSON, replacing invalid bytes rather than dropping the file.
	 *
	 * @param string $text Text.
	 * @return string
	 */
	private static function utf8( $text ) {
		if ( function_exists( 'mb_check_encoding' ) && ! mb_check_encoding( $text, 'UTF-8' ) ) {
			return function_exists( 'mb_convert_encoding' ) ? (string) mb_convert_encoding( $text, 'UTF-8', 'UTF-8' ) : (string) wp_check_invalid_utf8( $text, true );
		}
		return $text;
	}
}
