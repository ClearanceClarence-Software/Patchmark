<?php
/**
 * Reads one source file: what it declares, which hooks and routes it registers, and code that
 * deserves a second look.
 *
 * @package Patchmark
 */

namespace ClearanceClarence\Patchmark;

defined( 'ABSPATH' ) || exit;

/**
 * PHP is read with the tokenizer, so a word in a comment or a method that happens to be called
 * exec() is not mistaken for a call. Other text files only get a light scan for addresses.
 */
final class CodeScan {

	/**
	 * Functions worth a second look, by signal.
	 */
	const CALLS = array(
		'shell'   => array( 'shell_exec', 'exec', 'system', 'passthru', 'proc_open', 'popen', 'pcntl_exec' ),
		'dynamic' => array( 'create_function', 'assert' ),
		'decode'  => array( 'base64_decode', 'str_rot13', 'gzinflate', 'gzuncompress', 'gzdecode', 'hex2bin', 'convert_uudecode' ),
		'users'   => array( 'wp_create_user', 'wp_insert_user', 'add_role', 'wp_set_auth_cookie', 'wp_set_current_user', 'grant_super_admin' ),
		'remote'  => array( 'wp_remote_get', 'wp_remote_post', 'wp_remote_request', 'wp_remote_head', 'wp_safe_remote_get', 'wp_safe_remote_post', 'wp_safe_remote_request', 'curl_exec', 'curl_multi_exec', 'fsockopen', 'stream_socket_client', 'download_url' ),
		'writes'  => array( 'file_put_contents', 'move_uploaded_file', 'wp_upload_bits' ),
	);

	/**
	 * Hosts that are only ever documentation or schema references. WordPress's own domains
	 * and their subdomains are matched by QUIET_SUFFIX instead.
	 */
	const QUIET_HOSTS = array( 'www.w3.org', 'w3.org', 'schema.org', 'json-schema.org', 'www.gnu.org', 'gnu.org', 'opensource.org', 'creativecommons.org', 'php.net', 'www.php.net', 'secure.php.net', 'developer.mozilla.org', 'example.com', 'www.example.com', 'example.org', 'example.net', 'localhost', 'semver.org', 'keepachangelog.com', 'ogp.me', 'purl.org', 'xmlns.com', 'ns.adobe.com' );

	/**
	 * WordPress's own domains and their subdomains.
	 */
	const QUIET_SUFFIX = '/(^|\.)(wordpress|wp|w)\.org$/';

	/**
	 * Result of a scan.
	 *
	 * @param string $code Source.
	 * @param string $rel  Path, for the file type.
	 * @return array{signals: array<string, int[]>, hosts: array<string, int>, symbols: array<string, string[]>}
	 */
	public static function scan( $code, $rel ) {
		$ext = Comparison::ext( $rel );
		if ( in_array( $ext, array( 'php', 'phtml', 'inc', 'php5', 'php7', 'phps' ), true ) ) {
			return self::php( (string) $code );
		}
		$out = self::empty_result();
		if ( in_array( $ext, array( 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx' ), true ) ) {
			$out['hosts'] = self::hosts( $code );
			foreach ( self::lines_matching( $code, '/\beval\s*\(|\bnew\s+Function\s*\(/' ) as $line ) {
				$out['signals']['eval'][] = $line;
			}
		} elseif ( in_array( $ext, array( 'json', 'html', 'htm', 'xml', 'ini', 'yml', 'yaml', 'htaccess' ), true ) ) {
			$out['hosts'] = self::hosts( $code );
		}
		return $out;
	}

	/**
	 * Tokenizer pass over PHP.
	 *
	 * @param string $code Source.
	 * @return array
	 */
	private static function php( $code ) {
		$out    = self::empty_result();
		$tokens = token_get_all( $code );
		$count  = count( $tokens );

		$call_map = array();
		foreach ( self::CALLS as $signal => $names ) {
			foreach ( $names as $name ) {
				$call_map[ $name ] = $signal;
			}
		}

		$namespace  = '';
		$class      = '';
		$class_end  = -1;
		$depth      = 0;
		$line       = 1;
		$code_index = array(); // Indexes of the tokens that are not whitespace or comments.

		for ( $i = 0; $i < $count; $i++ ) {
			$t = $tokens[ $i ];
			if ( is_array( $t ) ) {
				$line = $t[2];
				if ( T_WHITESPACE !== $t[0] && T_COMMENT !== $t[0] && T_DOC_COMMENT !== $t[0] ) {
					$code_index[] = $i;
				}
			} else {
				$code_index[] = $i;
			}
		}

		$n = count( $code_index );
		$k = -1;
		while ( ++$k < $n ) {
			$t    = $tokens[ $code_index[ $k ] ];
			$id   = is_array( $t ) ? $t[0] : null;
			$text = is_array( $t ) ? $t[1] : $t;
			$line = is_array( $t ) ? $t[2] : $line;
			$prev = $k > 0 ? $tokens[ $code_index[ $k - 1 ] ] : null;
			$next = $k + 1 < $n ? $tokens[ $code_index[ $k + 1 ] ] : null;

			// Braces, to know when a class body ends.
			if ( '{' === $text || T_CURLY_OPEN === $id || T_DOLLAR_OPEN_CURLY_BRACES === $id ) {
				++$depth;
			} elseif ( '}' === $text ) {
				--$depth;
				if ( $depth === $class_end ) {
					$class     = '';
					$class_end = -1;
				}
			}

			if ( T_NAMESPACE === $id ) {
				$namespace = self::read_name( $tokens, $code_index, $k + 1 );
				continue;
			}

			if ( in_array( $id, self::class_tokens(), true ) && ! self::is_member_access( $prev ) && is_array( $next ) && T_STRING === $next[0] ) {
				// "class Foo" but not "Foo::class" or "new class".
				$class                       = ltrim( $namespace . '\\' . $next[1], '\\' );
				$class_end                   = $depth;
				$out['symbols']['classes'][] = $class;
				continue;
			}

			if ( T_FUNCTION === $id && is_array( $next ) && T_STRING === $next[0] ) {
				$name = $next[1];
				if ( '' === $class ) {
					$out['symbols']['functions'][] = ltrim( $namespace . '\\' . $name, '\\' );
				} elseif ( self::is_public( $tokens, $code_index, $k ) ) {
					$out['symbols']['methods'][] = $class . '::' . $name;
				}
				continue;
			}

			if ( T_EVAL === $id ) {
				$out['signals']['eval'][] = $line;
				continue;
			}

			if ( '`' === $text ) {
				$out['signals']['shell'][] = $line;
				// Skip to the closing backtick.
				while ( $k + 1 < $n && '`' !== $tokens[ $code_index[ $k + 1 ] ] ) {
					++$k;
				}
				++$k;
				continue;
			}

			if ( in_array( $id, array( T_INCLUDE, T_INCLUDE_ONCE, T_REQUIRE, T_REQUIRE_ONCE ), true ) && self::statement_uses_input( $tokens, $code_index, $k + 1 ) ) {
				$out['signals']['include_input'][] = $line;
				continue;
			}

			if ( T_CONSTANT_ENCAPSED_STRING === $id || T_ENCAPSED_AND_WHITESPACE === $id ) {
				foreach ( self::hosts( $text ) as $host => $unused ) {
					if ( ! isset( $out['hosts'][ $host ] ) ) {
						$out['hosts'][ $host ] = $line;
					}
				}
				if ( strlen( $text ) > 1000 && preg_match( '/^[\'"]?[A-Za-z0-9+\/=\s]{1000,}[\'"]?$/', $text ) ) {
					$out['signals']['blob'][] = $line;
				}
				continue;
			}

			$is_name = T_STRING === $id || ( defined( 'T_NAME_FULLY_QUALIFIED' ) && T_NAME_FULLY_QUALIFIED === $id );
			if ( ! $is_name || ! is_string( $next ) || '(' !== $next || self::is_member_access( $prev ) || ( is_array( $prev ) && T_FUNCTION === $prev[0] ) ) {
				continue;
			}

			// A plain function call. "\exec(" counts the same as "exec(".
			$name = strtolower( ltrim( $text, '\\' ) );
			if ( isset( $call_map[ $name ] ) ) {
				$out['signals'][ $call_map[ $name ] ][] = $line;
			}
			if ( 'unserialize' === $name && self::statement_uses_input( $tokens, $code_index, $k + 1 ) ) {
				$out['signals']['unserialize_input'][] = $line;
			}

			$first = self::first_argument( $tokens, $code_index, $k + 2 );
			if ( null === $first ) {
				continue;
			}
			if ( in_array( $name, array( 'do_action', 'apply_filters', 'do_action_ref_array', 'apply_filters_ref_array', 'do_action_deprecated', 'apply_filters_deprecated' ), true ) ) {
				$out['symbols']['hooks'][] = $first;
			} elseif ( 'add_shortcode' === $name ) {
				$out['symbols']['shortcodes'][] = $first;
			} elseif ( 'register_rest_route' === $name ) {
				$second = self::nth_argument( $tokens, $code_index, $k + 2, 2 );
				if ( null !== $second ) {
					$out['symbols']['routes'][] = '/' . trim( $first, '/' ) . '/' . ltrim( $second, '/' );
				}
			} elseif ( 'register_post_type' === $name ) {
				$out['symbols']['post_types'][] = $first;
			} elseif ( 'register_block_type' === $name && preg_match( '#^[a-z0-9-]+/[a-z0-9-]+$#', $first ) ) {
				$out['symbols']['blocks'][] = $first;
			}
		}

		foreach ( $out['symbols'] as $key => $list ) {
			$out['symbols'][ $key ] = array_values( array_unique( $list ) );
		}
		return $out;
	}

	/**
	 * Empty result.
	 *
	 * @return array
	 */
	private static function empty_result() {
		return array(
			'signals' => array(),
			'hosts'   => array(),
			'symbols' => array_fill_keys( array( 'functions', 'classes', 'methods', 'hooks', 'routes', 'shortcodes', 'post_types', 'blocks' ), array() ),
		);
	}

	/**
	 * Tokens that open a class-like declaration.
	 *
	 * @return int[]
	 */
	private static function class_tokens() {
		$ids = array( T_CLASS, T_INTERFACE, T_TRAIT );
		if ( defined( 'T_ENUM' ) ) {
			$ids[] = T_ENUM;
		}
		return $ids;
	}

	/**
	 * Whether a token is ->, ?-> or ::.
	 *
	 * @param mixed $token Token.
	 * @return bool
	 */
	private static function is_member_access( $token ) {
		if ( ! is_array( $token ) ) {
			return false;
		}
		$ids = array( T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NEW );
		if ( defined( 'T_NULLSAFE_OBJECT_OPERATOR' ) ) {
			$ids[] = T_NULLSAFE_OBJECT_OPERATOR;
		}
		return in_array( $token[0], $ids, true );
	}

	/**
	 * Whether the method declared at $k is public (no private or protected before it).
	 *
	 * @param array $tokens Tokens.
	 * @param int[] $index  Code token indexes.
	 * @param int   $k      Position of the function keyword.
	 * @return bool
	 */
	private static function is_public( array $tokens, array $index, $k ) {
		for ( $j = $k - 1; $j >= 0 && $j >= $k - 4; $j-- ) {
			$t = $tokens[ $index[ $j ] ];
			if ( ! is_array( $t ) ) {
				break;
			}
			if ( T_PRIVATE === $t[0] || T_PROTECTED === $t[0] ) {
				return false;
			}
			if ( ! in_array( $t[0], array( T_PUBLIC, T_STATIC, T_ABSTRACT, T_FINAL ), true ) ) {
				break;
			}
		}
		return true;
	}

	/**
	 * Reads a (possibly qualified) name starting at $k.
	 *
	 * @param array $tokens Tokens.
	 * @param int[] $index  Code token indexes.
	 * @param int   $k      Start.
	 * @return string
	 */
	private static function read_name( array $tokens, array $index, $k ) {
		$name  = '';
		$parts = array( T_STRING, T_NS_SEPARATOR );
		if ( defined( 'T_NAME_QUALIFIED' ) ) {
			$parts[] = T_NAME_QUALIFIED;
			$parts[] = T_NAME_FULLY_QUALIFIED;
		}
		$n = count( $index );
		for ( ; $k < $n; $k++ ) {
			$t = $tokens[ $index[ $k ] ];
			if ( ! is_array( $t ) || ! in_array( $t[0], $parts, true ) ) {
				break;
			}
			$name .= $t[1];
		}
		return trim( $name, '\\' );
	}

	/**
	 * The first argument when it is a plain string, or a string with variables written out as
	 * {$var} (dynamic hook names such as "save_post_{$post_type}").
	 *
	 * @param array $tokens Tokens.
	 * @param int[] $index  Code token indexes.
	 * @param int   $k      Position after the opening parenthesis.
	 * @return string|null
	 */
	private static function first_argument( array $tokens, array $index, $k ) {
		return self::nth_argument( $tokens, $index, $k, 1 );
	}

	/**
	 * The nth argument when it is a string.
	 *
	 * @param array $tokens Tokens.
	 * @param int[] $index  Code token indexes.
	 * @param int   $k      Position after the opening parenthesis.
	 * @param int   $nth    1-based argument number.
	 * @return string|null
	 */
	private static function nth_argument( array $tokens, array $index, $k, $nth ) {
		$n     = count( $index );
		$arg   = 1;
		$depth = 0;
		for ( ; $k < $n && $arg < $nth; $k++ ) {
			$t = $tokens[ $index[ $k ] ];
			if ( '(' === $t || '[' === $t ) {
				++$depth;
			} elseif ( ')' === $t || ']' === $t ) {
				if ( 0 === $depth-- ) {
					return null;
				}
			} elseif ( ',' === $t && 0 === $depth ) {
				++$arg;
			}
		}
		if ( $k >= $n ) {
			return null;
		}

		$t = $tokens[ $index[ $k ] ];
		if ( is_array( $t ) && T_CONSTANT_ENCAPSED_STRING === $t[0] ) {
			$next = $k + 1 < $n ? $tokens[ $index[ $k + 1 ] ] : null;
			if ( ',' === $next || ')' === $next ) {
				$inner = substr( $t[1], 1, -1 );
				// Single quotes only escape \\ and \', so a regex such as \d+ stays as written.
				return "'" === $t[1][0] ? str_replace( array( '\\\\', "\\'" ), array( '\\', "'" ), $inner ) : stripcslashes( $inner );
			}
			return null;
		}
		if ( '"' === $t ) {
			// "prefix_{$var}_suffix": keep the literal parts and write variables as {$var}.
			$text = '';
			for ( $k++; $k < $n; $k++ ) {
				$p = $tokens[ $index[ $k ] ];
				if ( '"' === $p ) {
					return '' === $text ? null : $text;
				}
				$text .= is_array( $p ) ? $p[1] : $p;
				if ( strlen( $text ) > 200 ) {
					return null;
				}
			}
		}
		return null;
	}

	/**
	 * Whether the statement from $k on reads $_GET, $_POST, $_REQUEST, $_COOKIE or $_FILES.
	 *
	 * @param array $tokens Tokens.
	 * @param int[] $index  Code token indexes.
	 * @param int   $k      Start.
	 * @return bool
	 */
	private static function statement_uses_input( array $tokens, array $index, $k ) {
		$depth = 0;
		$n     = count( $index );
		$limit = $k + 40;
		for ( ; $k < $n && $k < $limit; $k++ ) {
			$t = $tokens[ $index[ $k ] ];
			if ( ';' === $t || ( ')' === $t && 0 === $depth-- ) ) {
				return false;
			}
			if ( '(' === $t ) {
				++$depth;
			}
			if ( is_array( $t ) && T_VARIABLE === $t[0] && in_array( $t[1], array( '$_GET', '$_POST', '$_REQUEST', '$_COOKIE', '$_FILES', '$_SERVER' ), true ) ) {
				return '$_SERVER' !== $t[1];
			}
		}
		return false;
	}

	/**
	 * Hosts named in http(s) URLs.
	 *
	 * @param string $text Text.
	 * @return array<string, int> Host => line.
	 */
	public static function hosts( $text ) {
		$out = array();
		if ( ! preg_match_all( '#https?://([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)#i', (string) $text, $m, PREG_OFFSET_CAPTURE ) ) {
			return $out;
		}
		foreach ( $m[1] as $match ) {
			$host = strtolower( $match[0] );
			if ( in_array( $host, self::QUIET_HOSTS, true ) || preg_match( self::QUIET_SUFFIX, $host ) || preg_match( '/\.(test|local|localhost|invalid|example)$/', $host ) || ! preg_match( '/[a-z]/', $host ) ) {
				continue;
			}
			if ( ! isset( $out[ $host ] ) ) {
				$out[ $host ] = substr_count( substr( $text, 0, $match[1] ), "\n" ) + 1;
			}
		}
		return $out;
	}

	/**
	 * Line numbers where a pattern matches.
	 *
	 * @param string $text    Text.
	 * @param string $pattern Regex.
	 * @return int[]
	 */
	private static function lines_matching( $text, $pattern ) {
		$out = array();
		if ( preg_match_all( $pattern, (string) $text, $m, PREG_OFFSET_CAPTURE ) ) {
			foreach ( $m[0] as $match ) {
				$out[] = substr_count( substr( $text, 0, $match[1] ), "\n" ) + 1;
			}
		}
		return $out;
	}
}
