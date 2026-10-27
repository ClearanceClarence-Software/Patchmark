// The stock @wordpress/scripts config, with two exceptions:
// - camelcase: settings keys mirror the PHP option keys (local_terms, match_mode, ...).
// - no-nested-ternary: short status pickers read better inline, as in Routemark.
const base = require( '@wordpress/scripts/config/eslint.config.cjs' );

module.exports = [
	...base,
	{
		rules: {
			camelcase: 'off',
			'no-nested-ternary': 'off',
		},
	},
];
