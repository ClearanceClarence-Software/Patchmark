<?php
/**
 * Changelog entries between the installed and the uploaded version.
 *
 * @package UploadDiff
 */

namespace ClearanceClarence\UploadDiff;

defined( 'ABSPATH' ) || exit;

/**
 * Reads the Changelog and Upgrade Notice sections of readme.txt (or a CHANGELOG.md) and keeps
 * the entries that apply to this update.
 */
final class Changelog {

	/**
	 * Most entries returned.
	 */
	const MAX_ENTRIES = 25;

	/**
	 * Entries between the two versions.
	 *
	 * @param Package $installed   Installed package.
	 * @param Package $uploaded    Uploaded package.
	 * @param string  $old_version Installed version.
	 * @param string  $new_version Uploaded version.
	 * @return array{source: string, entries: array[], notice: string, downgrade: bool}|null
	 */
	public static function between( Package $installed, Package $uploaded, $old_version, $new_version ) {
		$downgrade = '' !== $old_version && '' !== $new_version && version_compare( $new_version, $old_version, '<' );

		// For a downgrade, the entries that matter are the ones being given up, which only the
		// installed copy describes.
		$package = $downgrade ? $installed : $uploaded;
		$found   = self::find( $package );
		if ( null === $found ) {
			return null;
		}

		list( $source, $text ) = $found;
		$entries               = 'md' === Comparison::ext( $source ) ? self::parse_markdown( $text ) : self::parse_readme( self::section( $text, 'changelog' ) );
		if ( ! $entries ) {
			return null;
		}

		$low  = $downgrade ? $new_version : $old_version;
		$high = $downgrade ? $old_version : $new_version;

		$picked = array();
		$dated  = false;
		foreach ( $entries as $entry ) {
			if ( '' === $entry['version'] ) {
				continue;
			}
			$dated = true;
			$above = '' === $low || version_compare( $entry['version'], $low, '>' );
			$below = '' === $high || version_compare( $entry['version'], $high, '<=' );
			if ( $above && $below ) {
				$picked[] = $entry;
			}
		}
		if ( ! $dated ) {
			$picked = array_slice( $entries, 0, 1 );
		}

		$notice = '';
		if ( ! $downgrade && 'md' !== Comparison::ext( $source ) ) {
			foreach ( self::parse_readme( self::section( $text, 'upgrade notice' ) ) as $entry ) {
				if ( '' !== $entry['version'] && version_compare( $entry['version'], $new_version, '==' ) ) {
					$notice = implode( ' ', wp_list_pluck( $entry['lines'], 'text' ) );
					break;
				}
			}
		}

		return array(
			'source'    => $source,
			'entries'   => array_slice( $picked, 0, self::MAX_ENTRIES ),
			'more'      => max( 0, count( $picked ) - self::MAX_ENTRIES ),
			'notice'    => $notice,
			'downgrade' => $downgrade,
		);
	}

	/**
	 * Stable tag from readme.txt.
	 *
	 * @param Package $package Package.
	 * @return string
	 */
	public static function stable_tag( Package $package ) {
		$found = self::find( $package, false );
		if ( null === $found || ! preg_match( '/^[ \t*]*Stable tag:[ \t]*(\S+)/mi', $found[1], $m ) ) {
			return '';
		}
		return trim( $m[1] );
	}

	/**
	 * The readme (or changelog) file and its contents.
	 *
	 * @param Package $package  Package.
	 * @param bool    $markdown Whether CHANGELOG.md may be used.
	 * @return array{0: string, 1: string}|null
	 */
	private static function find( Package $package, $markdown = true ) {
		$names = array();
		foreach ( array_keys( $package->files() ) as $rel ) {
			if ( false === strpos( $rel, '/' ) ) {
				$names[ strtolower( $rel ) ] = $rel;
			}
		}

		$readme = isset( $names['readme.txt'] ) ? $package->read( $names['readme.txt'], 1048576 ) : null;
		if ( null !== $readme && ( ! $markdown || '' !== trim( self::section( $readme, 'changelog' ) ) ) ) {
			return array( $names['readme.txt'], $readme );
		}
		if ( $markdown ) {
			foreach ( array( 'changelog.md', 'changes.md', 'history.md' ) as $name ) {
				if ( isset( $names[ $name ] ) ) {
					$text = $package->read( $names[ $name ], 1048576 );
					if ( null !== $text ) {
						return array( $names[ $name ], $text );
					}
				}
			}
		}
		return null === $readme ? null : array( $names['readme.txt'], $readme );
	}

	/**
	 * One "== Section ==" of a readme.txt (also "## Section" in readme.md style).
	 *
	 * @param string $text Readme.
	 * @param string $name Section name, lowercase.
	 * @return string
	 */
	private static function section( $text, $name ) {
		$lines = preg_split( '/\R/', (string) $text );
		$out   = array();
		$in    = false;
		foreach ( (array) $lines as $line ) {
			if ( preg_match( '/^\s*(?:==\s*([^=]+?)\s*==|##\s+([^#].*?))\s*$/', $line, $m ) ) {
				$title = strtolower( trim( '' !== $m[1] ? $m[1] : $m[2] ) );
				if ( $in ) {
					break;
				}
				$in = ( $title === $name );
				continue;
			}
			if ( $in ) {
				$out[] = $line;
			}
		}
		return implode( "\n", $out );
	}

	/**
	 * Entries headed "= 1.2.0 =" (or "#### 1.2.0", "### 1.2.0").
	 *
	 * @param string $section Section text.
	 * @return array[]
	 */
	private static function parse_readme( $section ) {
		$entries = array();
		$current = null;
		foreach ( (array) preg_split( '/\R/', (string) $section ) as $line ) {
			if ( preg_match( '/^\s*(?:=\s*(.+?)\s*=|#{3,4}\s+(.+?))\s*$/', $line, $m ) ) {
				if ( null !== $current ) {
					$entries[] = $current;
				}
				$current = self::entry( '' !== $m[1] ? $m[1] : $m[2] );
				continue;
			}
			if ( null !== $current ) {
				self::add_line( $current, $line );
			}
		}
		if ( null !== $current ) {
			$entries[] = $current;
		}
		return array_values( array_filter( $entries, array( self::class, 'has_lines' ) ) );
	}

	/**
	 * Entries headed "## [1.2.0] - 2024-05-01" or "## 1.2.0", with "### Added" style groups.
	 *
	 * @param string $text Markdown.
	 * @return array[]
	 */
	private static function parse_markdown( $text ) {
		$entries = array();
		$current = null;
		foreach ( (array) preg_split( '/\R/', (string) $text ) as $line ) {
			if ( preg_match( '/^\s*##\s+(.+?)\s*$/', $line, $m ) && ! preg_match( '/^#/', $m[1] ) ) {
				if ( null !== $current ) {
					$entries[] = $current;
				}
				$current = self::entry( $m[1] );
				continue;
			}
			if ( null === $current ) {
				continue;
			}
			if ( preg_match( '/^\s*#{3,}\s+(.+?)\s*$/', $line, $m ) ) {
				$current['lines'][] = array(
					'type' => 'group',
					'text' => $m[1],
				);
				continue;
			}
			self::add_line( $current, $line );
		}
		if ( null !== $current ) {
			$entries[] = $current;
		}
		return array_values( array_filter( $entries, array( self::class, 'has_lines' ) ) );
	}

	/**
	 * New entry from a heading.
	 *
	 * @param string $heading Heading.
	 * @return array
	 */
	private static function entry( $heading ) {
		$heading = trim( str_replace( array( '[', ']' ), '', $heading ) );
		$version = preg_match( '/(?:^|[^\w.])v?(\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z.-]+)?)/', $heading, $m ) ? $m[1] : '';
		$date    = preg_match( '/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\b/', $heading, $d ) ? $d[1] : '';
		return array(
			'heading' => mb_substr( $heading, 0, 120 ),
			'version' => $version,
			'date'    => $date,
			'lines'   => array(),
		);
	}

	/**
	 * Adds one line: a list item, or text joined to the previous line.
	 *
	 * @param array  $entry Entry.
	 * @param string $line  Line.
	 */
	private static function add_line( array &$entry, $line ) {
		if ( '' === trim( $line ) || count( $entry['lines'] ) >= 60 ) {
			return;
		}
		if ( preg_match( '/^\s*[*\-+]\s+(.*)$/', $line, $m ) ) {
			$entry['lines'][] = array(
				'type' => 'item',
				'text' => mb_substr( trim( $m[1] ), 0, 500 ),
			);
			return;
		}
		$last = count( $entry['lines'] ) - 1;
		if ( $last >= 0 && 'group' !== $entry['lines'][ $last ]['type'] ) {
			$entry['lines'][ $last ]['text'] = mb_substr( $entry['lines'][ $last ]['text'] . ' ' . trim( $line ), 0, 500 );
			return;
		}
		$entry['lines'][] = array(
			'type' => 'text',
			'text' => mb_substr( trim( $line ), 0, 500 ),
		);
	}

	/**
	 * Whether an entry has any lines.
	 *
	 * @param array $entry Entry.
	 * @return bool
	 */
	private static function has_lines( array $entry ) {
		return ! empty( $entry['lines'] );
	}
}
