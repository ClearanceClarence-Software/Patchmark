<?php
/**
 * Things worth a look before replacing the installed plugin.
 *
 * @package UploadDiff
 */

namespace ClearanceClarence\UploadDiff;

defined( 'ABSPATH' ) || exit;

/**
 * Builds the findings (header changes, unusual files, risky code) and the API changes from a
 * comparison. Only files that changed are read, so a large plugin with a small update is fast.
 */
final class Review {

	/**
	 * Largest file scanned.
	 */
	const MAX_SCAN = 2097152;

	/**
	 * Most bytes scanned in total, per side.
	 */
	const SCAN_BUDGET = 40 * 1024 * 1024;

	/**
	 * Most file references listed per finding.
	 */
	const MAX_REFS = 8;

	/**
	 * Comparison.
	 *
	 * @var Comparison
	 */
	private $cmp;

	/**
	 * Installed header data.
	 *
	 * @var array
	 */
	private $current;

	/**
	 * Uploaded header data.
	 *
	 * @var array
	 */
	private $uploaded;

	/**
	 * Installed main file, relative to the plugins folder ("folder/file.php").
	 *
	 * @var string
	 */
	private $plugin_file;

	/**
	 * Findings.
	 *
	 * @var array[]
	 */
	private $findings = array();

	/**
	 * Scan results: side => path => result.
	 *
	 * @var array
	 */
	private $scans = array(
		'old' => array(),
		'new' => array(),
	);

	/**
	 * Whether the scan budget ran out.
	 *
	 * @var bool
	 */
	private $partial = false;

	/**
	 * Constructor.
	 *
	 * @param Comparison $cmp         Comparison.
	 * @param array      $current     Installed header data.
	 * @param array      $uploaded    Uploaded header data.
	 * @param string     $plugin_file Installed main file, relative to the plugins folder.
	 */
	public function __construct( Comparison $cmp, array $current, array $uploaded, $plugin_file ) {
		$this->cmp         = $cmp;
		$this->current     = $current;
		$this->uploaded    = $uploaded;
		$this->plugin_file = (string) $plugin_file;
		$this->scan_changed();
	}

	/**
	 * All findings, most serious first.
	 *
	 * @return array[]
	 */
	public function findings() {
		$this->findings = array();
		$this->headers();
		$this->files();
		$this->code();

		$rank = array(
			'danger' => 0,
			'warn'   => 1,
			'info'   => 2,
		);
		usort(
			$this->findings,
			static function ( $a, $b ) use ( $rank ) {
				return $rank[ $a['severity'] ] <=> $rank[ $b['severity'] ];
			}
		);
		return $this->findings;
	}

	/**
	 * Declared functions, classes, public methods, hooks, routes, shortcodes, post types and
	 * blocks that the upload adds or removes, plus bundled Composer libraries.
	 *
	 * @return array{added: array, removed: array, libraries: array[], partial: bool}
	 */
	public function api() {
		$sets = array(
			'old' => array(),
			'new' => array(),
		);
		foreach ( $this->scans as $side => $results ) {
			foreach ( $results as $result ) {
				foreach ( $result['symbols'] as $kind => $names ) {
					foreach ( $names as $name ) {
						$sets[ $side ][ $kind ][ strtolower( $name ) ] = $name;
					}
				}
			}
		}
		$old = $sets['old'];
		$new = $sets['new'];

		$added   = array();
		$removed = array();
		foreach ( array( 'functions', 'classes', 'methods', 'hooks', 'routes', 'shortcodes', 'post_types', 'blocks' ) as $kind ) {
			$a = isset( $old[ $kind ] ) ? $old[ $kind ] : array();
			$b = isset( $new[ $kind ] ) ? $new[ $kind ] : array();

			// Methods of a removed class are covered by the class itself.
			$gone = array_values( array_diff_key( $a, $b ) );
			$came = array_values( array_diff_key( $b, $a ) );
			if ( 'methods' === $kind ) {
				$gone = $this->without_class_members( $gone, isset( $removed['classes'] ) ? $removed['classes'] : array() );
				$came = $this->without_class_members( $came, isset( $added['classes'] ) ? $added['classes'] : array() );
			}
			sort( $gone, SORT_NATURAL | SORT_FLAG_CASE );
			sort( $came, SORT_NATURAL | SORT_FLAG_CASE );
			if ( $gone ) {
				$removed[ $kind ] = $gone;
			}
			if ( $came ) {
				$added[ $kind ] = $came;
			}
		}

		return array(
			'added'     => (object) $added,
			'removed'   => (object) $removed,
			'libraries' => $this->libraries(),
			'partial'   => $this->partial,
		);
	}

	/**
	 * Scans both versions of every changed file.
	 */
	private function scan_changed() {
		$budget = array(
			'old' => self::SCAN_BUDGET,
			'new' => self::SCAN_BUDGET,
		);
		foreach ( $this->cmp->entries as $entry ) {
			if ( 'text' !== $entry['kind'] || 'whitespace' === $entry['status'] || 'renamed' === $entry['status'] ) {
				continue;
			}
			$sides = array();
			if ( 'added' !== $entry['status'] ) {
				$sides['old'] = array( $this->cmp->old, $entry['oldPath'] );
			}
			if ( 'removed' !== $entry['status'] ) {
				$sides['new'] = array( $this->cmp->new, $entry['path'] );
			}
			foreach ( $sides as $side => $source ) {
				$size = $source[0]->size( $source[1] );
				if ( $size > self::MAX_SCAN || $size > $budget[ $side ] ) {
					$this->partial = true;
					continue;
				}
				$code = $source[0]->read( $source[1], self::MAX_SCAN );
				if ( null === $code ) {
					continue;
				}
				$budget[ $side ]                       -= $size;
				$this->scans[ $side ][ $entry['path'] ] = CodeScan::scan( $code, $source[1] );
			}
		}
	}

	/**
	 * Header and environment checks.
	 */
	private function headers() {
		$cur = $this->current;
		$up  = $this->uploaded;
		$get = static function ( array $data, $key ) {
			return isset( $data[ $key ] ) && ! is_bool( $data[ $key ] ) ? trim( wp_strip_all_tags( (string) $data[ $key ] ) ) : '';
		};

		$old_v = $get( $cur, 'Version' );
		$new_v = $get( $up, 'Version' );

		if ( '' !== $old_v && '' !== $new_v && version_compare( $new_v, $old_v, '<' ) ) {
			$this->add(
				'warn',
				'downgrade',
				/* translators: 1: uploaded version, 2: installed version. */
				sprintf( __( 'This is an older version (%1$s) than the one installed (%2$s)', 'ccs-upload-diff' ), $new_v, $old_v ),
				__( 'Database changes made by the newer version are not undone. Check the changelog below for what you give up.', 'ccs-upload-diff' )
			);
		}

		$changed = count( $this->cmp->entries ) - count( $this->cmp->with_status( 'whitespace' ) );
		if ( '' !== $old_v && $old_v === $new_v && $changed > 0 ) {
			$this->add(
				'warn',
				'same-version',
				/* translators: %s: version. */
				sprintf( __( 'Both are version %s, but the files differ', 'ccs-upload-diff' ), $new_v ),
				__( 'Two different builds with one version number make it hard to tell later which one a site runs. Consider bumping the version.', 'ccs-upload-diff' )
			);
		}

		$old_name = $get( $cur, 'Name' );
		$new_name = $get( $up, 'Name' );
		if ( '' !== $old_name && '' !== $new_name && $old_name !== $new_name ) {
			$this->add(
				'danger',
				'name',
				__( 'The plugin name is different', 'ccs-upload-diff' ),
				/* translators: 1: installed name, 2: uploaded name. */
				sprintf( __( '"%1$s" would be replaced by "%2$s". The zip may be a different plugin that happens to use the same folder name.', 'ccs-upload-diff' ), $old_name, $new_name )
			);
		}

		$old_author = $get( $cur, 'Author' );
		$new_author = $get( $up, 'Author' );
		if ( '' !== $old_author && $old_author !== $new_author ) {
			$this->add(
				'warn',
				'author',
				__( 'The author is different', 'ccs-upload-diff' ),
				/* translators: 1: installed author, 2: uploaded author. */
				sprintf( __( 'Installed: %1$s. Uploaded: %2$s. Plugins do change hands, but make sure this zip came from someone you trust.', 'ccs-upload-diff' ), $old_author, '' !== $new_author ? $new_author : '—' )
			);
		}

		$old_update = $get( $cur, 'UpdateURI' );
		$new_update = $get( $up, 'UpdateURI' );
		if ( '' !== $new_update && $new_update !== $old_update ) {
			$this->add(
				'danger',
				'update-uri',
				__( 'Future updates would come from somewhere else', 'ccs-upload-diff' ),
				/* translators: %s: Update URI. */
				sprintf( __( 'The upload sets Update URI to %s. WordPress then stops offering updates from WordPress.org, and whoever controls that address decides what the next update contains.', 'ccs-upload-diff' ), $new_update )
			);
		} elseif ( '' !== $old_update && '' === $new_update ) {
			$this->add( 'info', 'update-uri-removed', __( 'The Update URI header was removed', 'ccs-upload-diff' ), __( 'Updates will be looked up on WordPress.org by the plugin folder name.', 'ccs-upload-diff' ) );
		}

		foreach ( array(
			'PluginURI' => __( 'Plugin URI', 'ccs-upload-diff' ),
			'AuthorURI' => __( 'Author URI', 'ccs-upload-diff' ),
		) as $key => $label ) {
			$a = (string) wp_parse_url( $get( $cur, $key ), PHP_URL_HOST );
			$b = (string) wp_parse_url( $get( $up, $key ), PHP_URL_HOST );
			if ( '' !== $a && '' !== $b && strtolower( $a ) !== strtolower( $b ) ) {
				/* translators: 1: header name, 2: old host, 3: new host. */
				$this->add( 'info', 'uri-' . strtolower( $key ), sprintf( __( '%1$s moved from %2$s to %3$s', 'ccs-upload-diff' ), $label, $a, $b ), '' );
			}
		}

		$requires_php = $get( $up, 'RequiresPHP' );
		if ( '' !== $requires_php && ! is_php_version_compatible( $requires_php ) ) {
			/* translators: 1: required PHP version, 2: server PHP version. */
			$this->add( 'danger', 'php', sprintf( __( 'Needs PHP %1$s, this server runs %2$s', 'ccs-upload-diff' ), $requires_php, PHP_VERSION ), __( 'WordPress will refuse to install it.', 'ccs-upload-diff' ) );
		}
		$requires_wp = $get( $up, 'RequiresWP' );
		if ( '' !== $requires_wp && ! is_wp_version_compatible( $requires_wp ) ) {
			/* translators: 1: required WordPress version, 2: installed WordPress version. */
			$this->add( 'danger', 'wp', sprintf( __( 'Needs WordPress %1$s, this site runs %2$s', 'ccs-upload-diff' ), $requires_wp, wp_get_wp_version() ), __( 'WordPress will refuse to install it.', 'ccs-upload-diff' ) );
		}
		if ( '' !== $requires_php && '' !== $get( $cur, 'RequiresPHP' ) && version_compare( $requires_php, $get( $cur, 'RequiresPHP' ), '>' ) && is_php_version_compatible( $requires_php ) ) {
			/* translators: 1: old minimum, 2: new minimum. */
			$this->add( 'info', 'php-raised', sprintf( __( 'Minimum PHP goes from %1$s to %2$s', 'ccs-upload-diff' ), $get( $cur, 'RequiresPHP' ), $requires_php ), __( 'This server meets it.', 'ccs-upload-diff' ) );
		}

		$deps = array_filter( array_map( 'trim', explode( ',', $get( $up, 'RequiresPlugins' ) ) ) );
		if ( $deps ) {
			$missing = array();
			$active  = (array) get_option( 'active_plugins', array() );
			$network = is_multisite() ? array_keys( (array) get_site_option( 'active_sitewide_plugins', array() ) ) : array();
			foreach ( $deps as $slug ) {
				$on = false;
				foreach ( array_merge( $active, $network ) as $file ) {
					if ( 0 === strpos( (string) $file, $slug . '/' ) || $slug . '.php' === $file ) {
						$on = true;
						break;
					}
				}
				if ( ! $on ) {
					$missing[] = $slug;
				}
			}
			if ( $missing ) {
				/* translators: %s: comma-separated plugin slugs. */
				$this->add( 'warn', 'dependencies', __( 'Needs plugins that are not active', 'ccs-upload-diff' ), sprintf( __( 'Requires Plugins lists %s. WordPress will not activate it until they are installed and active.', 'ccs-upload-diff' ), implode( ', ', $missing ) ) );
			}
		}

		// The main file decides which plugin WordPress thinks is active.
		$new_main = $this->cmp->new->main_file();
		$old_main = basename( $this->plugin_file );
		if ( '' !== $new_main && '' !== $old_main && $new_main !== $old_main ) {
			if ( ! function_exists( 'is_plugin_active' ) ) {
				require_once ABSPATH . 'wp-admin/includes/plugin.php';
			}
			$active = is_plugin_active( $this->plugin_file );
			$this->add(
				$active ? 'danger' : 'info',
				'main-file',
				/* translators: 1: old main file, 2: new main file. */
				sprintf( __( 'The main file is renamed from %1$s to %2$s', 'ccs-upload-diff' ), $old_main, $new_main ),
				$active ? __( 'WordPress tracks active plugins by this file name, so the plugin will be deactivated after the replacement. Activate it again afterwards.', 'ccs-upload-diff' ) : ''
			);
		}

		if ( $get( $cur, 'TextDomain' ) !== $get( $up, 'TextDomain' ) && '' !== $get( $cur, 'TextDomain' ) ) {
			/* translators: 1: old text domain, 2: new text domain. */
			$this->add( 'info', 'text-domain', sprintf( __( 'Text domain changes from %1$s to %2$s', 'ccs-upload-diff' ), $get( $cur, 'TextDomain' ), '' !== $get( $up, 'TextDomain' ) ? $get( $up, 'TextDomain' ) : '—' ), __( 'Existing translations may stop loading.', 'ccs-upload-diff' ) );
		}

		if ( empty( $cur['Network'] ) && ! empty( $up['Network'] ) ) {
			$this->add( 'warn', 'network', __( 'It becomes a network-only plugin', 'ccs-upload-diff' ), __( 'On multisite it can then only be activated network-wide.', 'ccs-upload-diff' ) );
		}

		$stable = Changelog::stable_tag( $this->cmp->new );
		if ( '' !== $stable && 'trunk' !== strtolower( $stable ) && '' !== $new_v && $stable !== $new_v ) {
			/* translators: 1: stable tag, 2: version. */
			$this->add( 'info', 'stable-tag', sprintf( __( 'readme.txt says Stable tag %1$s, the plugin says Version %2$s', 'ccs-upload-diff' ), $stable, $new_v ), '' );
		}
	}

	/**
	 * Files in places or formats where they rarely belong.
	 */
	private function files() {
		$config     = array();
		$hidden_php = array();
		$odd_php    = array();
		$exec       = array();
		$archives   = array();
		$dotfiles   = array();

		foreach ( $this->cmp->with_status( 'added', 'modified', 'renamed' ) as $entry ) {
			$path = $entry['path'];
			$base = strtolower( basename( $path ) );
			$ext  = Comparison::ext( $path );
			$ref  = array(
				'path'   => $path,
				'status' => $entry['status'],
			);

			if ( in_array( $base, array( '.htaccess', '.user.ini', 'php.ini', 'web.config', 'nginx.conf' ), true ) ) {
				$config[] = $ref;
			} elseif ( in_array( $ext, array( 'phtml', 'php3', 'php4', 'php5', 'php7', 'php8', 'pht', 'phar', 'phps' ), true ) || preg_match( '/\.php\.[a-z0-9]+$|\.(jpe?g|png|gif|ico|txt)\.php$/i', $base ) ) {
				$odd_php[] = $ref;
			} elseif ( 'php' === $ext && preg_match( '#(^|/)(images?|img|icons?|fonts?|css|uploads?|media|languages)/#i', $path ) ) {
				$hidden_php[] = $ref;
			} elseif ( in_array( $ext, array( 'exe', 'dll', 'so', 'dylib', 'sh', 'bat', 'cmd', 'ps1', 'jar', 'bin', 'com', 'msi', 'vbs' ), true ) ) {
				$exec[] = $ref;
			} elseif ( 'added' === $entry['status'] && in_array( $ext, array( 'zip', 'gz', 'tgz', 'tar', '7z', 'rar' ), true ) ) {
				$archives[] = $ref;
			} elseif ( 'added' === $entry['status'] && '.' === $base[0] && ! in_array( $base, array( '.gitignore', '.gitattributes', '.distignore', '.editorconfig', '.nvmrc', '.prettierrc', '.eslintrc', '.stylelintrc' ), true ) ) {
				$dotfiles[] = $ref;
			}
		}

		if ( $config ) {
			$this->add( 'danger', 'server-config', __( 'Adds or changes server configuration files', 'ccs-upload-diff' ), __( 'Files such as .htaccess and .user.ini change how the web server or PHP behaves for the whole folder. Plugins rarely need them; read them before replacing.', 'ccs-upload-diff' ), $config );
		}
		if ( $odd_php ) {
			$this->add( 'danger', 'odd-php', __( 'PHP files with unusual extensions', 'ccs-upload-diff' ), __( 'Extensions like .phtml or .phar, and names like image.jpg.php, are a classic way to slip code past a quick look.', 'ccs-upload-diff' ), $odd_php );
		}
		if ( $hidden_php ) {
			$this->add( 'warn', 'php-in-assets', __( 'PHP files in asset folders', 'ccs-upload-diff' ), __( 'PHP code in folders meant for images, fonts or styles is unusual. Check that these files belong there.', 'ccs-upload-diff' ), $hidden_php );
		}
		if ( $exec ) {
			$this->add( 'warn', 'executables', __( 'Contains executables or scripts', 'ccs-upload-diff' ), __( 'A WordPress plugin does not normally ship programs or shell scripts.', 'ccs-upload-diff' ), $exec );
		}
		if ( $archives ) {
			$this->add( 'info', 'archives', __( 'Bundles archives', 'ccs-upload-diff' ), __( 'The contents of archives inside the zip are not compared.', 'ccs-upload-diff' ), $archives );
		}
		if ( $dotfiles ) {
			$this->add( 'info', 'dotfiles', __( 'Adds hidden files', 'ccs-upload-diff' ), __( 'Files starting with a dot are hidden in most file browsers.', 'ccs-upload-diff' ), $dotfiles );
		}

		$counts = $this->cmp->counts();
		$total  = $counts['added'] + $counts['removed'] + $counts['renamed'] + $counts['modified'] + $counts['unchanged'];
		if ( $total > 20 && $counts['unchanged'] < $total * 0.1 && $counts['removed'] > $total * 0.3 ) {
			$this->add( 'warn', 'rewrite', __( 'Almost nothing is shared with the installed copy', 'ccs-upload-diff' ), __( 'Most files were removed or replaced. This may be a complete rewrite, or a different plugin.', 'ccs-upload-diff' ) );
		}
	}

	/**
	 * Code that appears in the upload but not in the installed copy of the same file.
	 */
	private function code() {
		$signals = array(
			'eval'              => array( 'danger', __( 'Runs code built from strings', 'ccs-upload-diff' ), __( 'eval() and similar calls run text as code. Combined with decoding (base64 and friends) it is the most common shape of injected malware.', 'ccs-upload-diff' ) ),
			'include_input'     => array( 'danger', __( 'Includes files named by the request', 'ccs-upload-diff' ), __( 'include or require with a value taken from $_GET, $_POST, $_REQUEST or $_COOKIE lets a visitor choose which file runs.', 'ccs-upload-diff' ) ),
			'unserialize_input' => array( 'danger', __( 'Unserializes data from the request', 'ccs-upload-diff' ), __( 'unserialize() on visitor input can create objects the attacker chooses. Plugins should use JSON instead.', 'ccs-upload-diff' ) ),
			'shell'             => array( 'danger', __( 'Runs shell commands', 'ccs-upload-diff' ), __( 'exec(), shell_exec(), system(), backticks and similar run programs on the server.', 'ccs-upload-diff' ) ),
			'blob'              => array( 'danger', __( 'Long encoded strings', 'ccs-upload-diff' ), __( 'Strings of thousands of base64 characters usually hide code or data. Fonts and images inlined as data URIs are the harmless exception.', 'ccs-upload-diff' ) ),
			'dynamic'           => array( 'warn', __( 'Creates functions at runtime', 'ccs-upload-diff' ), __( 'create_function() and assert() can run strings as code.', 'ccs-upload-diff' ) ),
			'users'             => array( 'warn', __( 'Creates users, roles or logins', 'ccs-upload-diff' ), __( 'New code that creates accounts, adds roles or sets login cookies. Expected in membership plugins, a red flag anywhere else.', 'ccs-upload-diff' ) ),
			'decode'            => array( 'warn', __( 'Decodes obfuscated data', 'ccs-upload-diff' ), __( 'base64_decode(), gzinflate(), str_rot13() and similar. Common and often harmless, but worth knowing what is being decoded.', 'ccs-upload-diff' ) ),
			'remote'            => array( 'info', __( 'New outgoing requests', 'ccs-upload-diff' ), __( 'Code that contacts other servers. Check where it connects and what it sends.', 'ccs-upload-diff' ) ),
			'writes'            => array( 'info', __( 'Writes files', 'ccs-upload-diff' ), __( 'New code that writes files to disk.', 'ccs-upload-diff' ) ),
		);

		$found = array();
		$hosts = array();
		$known = array();
		foreach ( $this->scans['old'] as $result ) {
			$known += $result['hosts'];
		}

		foreach ( $this->scans['new'] as $path => $result ) {
			$before = isset( $this->scans['old'][ $path ] ) ? $this->scans['old'][ $path ] : null;
			foreach ( $result['signals'] as $signal => $lines ) {
				$had = $before && isset( $before['signals'][ $signal ] ) ? count( $before['signals'][ $signal ] ) : 0;
				if ( count( $lines ) > $had ) {
					// The last occurrences are the likeliest to be new.
					$found[ $signal ][] = array(
						'path'  => $path,
						'lines' => array_slice( $had ? array_slice( $lines, $had ) : $lines, 0, 5 ),
						'count' => count( $lines ) - $had,
					);
				}
			}
			foreach ( $result['hosts'] as $host => $line ) {
				if ( ! isset( $known[ $host ] ) ) {
					$hosts[ $host ][] = array(
						'path'  => $path,
						'lines' => array( $line ),
					);
				}
			}
		}

		// eval() next to decoding is worse than either alone.
		if ( isset( $found['eval'], $found['decode'] ) ) {
			$signals['eval'][1] = __( 'Decodes text and runs it as code', 'ccs-upload-diff' );
		}

		foreach ( $signals as $signal => $meta ) {
			if ( empty( $found[ $signal ] ) ) {
				continue;
			}
			$this->add( $meta[0], 'code-' . $signal, $meta[1], $meta[2], $found[ $signal ] );
		}

		if ( $hosts ) {
			ksort( $hosts );
			$refs = array();
			foreach ( $hosts as $host => $where ) {
				foreach ( $where as $ref ) {
					$ref['label'] = $host;
					$refs[]       = $ref;
				}
			}
			$this->add(
				count( $hosts ) > 0 && isset( $found['remote'] ) ? 'warn' : 'info',
				'hosts',
				sprintf(
					/* translators: %d: number of web addresses. */
					_n( '%d new web address in the code', '%d new web addresses in the code', count( $hosts ), 'ccs-upload-diff' ),
					count( $hosts )
				),
				implode( ', ', array_slice( array_keys( $hosts ), 0, 12 ) ) . ( count( $hosts ) > 12 ? ' …' : '' ),
				$refs
			);
		}

		if ( $this->partial ) {
			$this->add( 'info', 'partial', __( 'Some large files were not scanned', 'ccs-upload-diff' ), __( 'Files over 2 MB, and anything past 40 MB of changed code, are compared but not read for the checks above.', 'ccs-upload-diff' ) );
		}
	}

	/**
	 * Composer packages bundled in vendor/, before and after.
	 *
	 * @return array[]
	 */
	private function libraries() {
		$old = $this->composer( $this->cmp->old );
		$new = $this->composer( $this->cmp->new );
		$out = array();
		foreach ( array_unique( array_merge( array_keys( $old ), array_keys( $new ) ) ) as $name ) {
			$a = isset( $old[ $name ] ) ? $old[ $name ] : null;
			$b = isset( $new[ $name ] ) ? $new[ $name ] : null;
			if ( $a === $b ) {
				continue;
			}
			$out[] = array(
				'name' => $name,
				'from' => $a,
				'to'   => $b,
			);
		}
		usort(
			$out,
			static function ( $x, $y ) {
				return strcmp( $x['name'], $y['name'] );
			}
		);
		return $out;
	}

	/**
	 * Package => version from vendor/composer/installed.json or composer.lock.
	 *
	 * @param Package $package Package.
	 * @return array<string, string>
	 */
	private function composer( Package $package ) {
		$files = $package->files();
		$found = '';
		foreach ( array_keys( $files ) as $rel ) {
			if ( preg_match( '#(^|/)vendor/composer/installed\.json$#', $rel ) ) {
				$found = $rel;
				break;
			}
		}
		if ( '' === $found && isset( $files['composer.lock'] ) ) {
			$found = 'composer.lock';
		}
		if ( '' === $found ) {
			return array();
		}
		$data = json_decode( (string) $package->read( $found, 4194304 ), true );
		if ( ! is_array( $data ) ) {
			return array();
		}
		$list = isset( $data['packages'] ) ? $data['packages'] : $data;
		$out  = array();
		foreach ( (array) $list as $item ) {
			if ( is_array( $item ) && isset( $item['name'], $item['version'] ) ) {
				$out[ (string) $item['name'] ] = ltrim( (string) $item['version'], 'v' );
			}
		}
		return $out;
	}

	/**
	 * Drops Class::method entries whose class is in the list.
	 *
	 * @param string[] $methods Methods.
	 * @param string[] $classes Classes.
	 * @return string[]
	 */
	private function without_class_members( array $methods, array $classes ) {
		if ( ! $classes ) {
			return $methods;
		}
		$set = array_flip( array_map( 'strtolower', $classes ) );
		return array_values(
			array_filter(
				$methods,
				static function ( $method ) use ( $set ) {
					return ! isset( $set[ strtolower( (string) strstr( $method, '::', true ) ) ] );
				}
			)
		);
	}

	/**
	 * Adds a finding.
	 *
	 * @param string $severity danger, warn or info.
	 * @param string $id       Stable identifier.
	 * @param string $title    Short title.
	 * @param string $detail   Explanation.
	 * @param array  $refs     Files: path, optional lines, status, label, count.
	 */
	private function add( $severity, $id, $title, $detail, array $refs = array() ) {
		$this->findings[] = array(
			'severity' => $severity,
			'id'       => $id,
			'title'    => $title,
			'detail'   => $detail,
			'refs'     => array_slice( $refs, 0, self::MAX_REFS * 3 ),
			'more'     => max( 0, count( $refs ) - self::MAX_REFS * 3 ),
		);
	}
}
