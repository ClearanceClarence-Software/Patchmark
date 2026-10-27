// Having this file stops @wordpress/scripts from adding cssnano in production
// builds. Same plugins as the default, just without the minifier.
module.exports = {
	plugins: require( '@wordpress/postcss-plugins-preset' ),
};
