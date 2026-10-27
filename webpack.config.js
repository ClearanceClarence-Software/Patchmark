// The stock @wordpress/scripts setup, with minification turned off so the
// files in build/ stay readable. Everything else (dependency extraction,
// asset file, RTL stylesheet) is unchanged.
//
// Three things minify by default in a production build:
//   - Terser for the JS          -> optimization.minimize: false below
//   - cssnano for the CSS        -> postcss.config.js in this folder replaces it
//   - Sass's own "compressed"    -> sassOptions.style: 'expanded' below
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );

const expandSass = ( use ) =>
	use && typeof use === 'object' && String( use.loader ).includes( 'sass-loader' )
		? { ...use, options: { ...use.options, sassOptions: { ...use.options?.sassOptions, style: 'expanded' } } }
		: use;

module.exports = {
	...defaultConfig,
	optimization: {
		...defaultConfig.optimization,
		minimize: false,
	},
	module: {
		...defaultConfig.module,
		rules: defaultConfig.module.rules.map( ( rule ) =>
			Array.isArray( rule.use ) ? { ...rule, use: rule.use.map( expandSass ) } : rule
		),
	},
};
