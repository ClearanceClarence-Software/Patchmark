import { __, _n, sprintf } from '@wordpress/i18n';

const locale = () => document.documentElement.lang || 'en-US';

export function num( n: number ): string {
	return new Intl.NumberFormat( locale() ).format( n );
}

export function bytes( n: number | null ): string {
	if ( n === null ) {
		return '—';
	}
	if ( n < 1024 ) {
		return sprintf(
			/* translators: %s: number of bytes */
			_n( '%s byte', '%s bytes', n, 'patchmark' ),
			num( n )
		);
	}
	const units = [ 'KB', 'MB', 'GB' ];
	let value = n / 1024;
	let unit = 0;
	while ( value >= 1024 && unit < units.length - 1 ) {
		value /= 1024;
		unit++;
	}
	return `${ new Intl.NumberFormat( locale(), {
		maximumFractionDigits: value < 10 ? 1 : 0,
	} ).format( value ) } ${ units[ unit ] }`;
}

// "+12 KB", "−3 KB", "no change".
export function sizeChange( from: number, to: number ): string {
	const diff = to - from;
	if ( diff === 0 ) {
		return __( 'same size', 'patchmark' );
	}
	return ( diff > 0 ? '+' : '−' ) + bytes( Math.abs( diff ) );
}

export function versionDirection( from: string, to: string ): -1 | 0 | 1 {
	if ( ! from || ! to || from === to ) {
		return 0;
	}
	const a = from.split( /[.-]/ );
	const b = to.split( /[.-]/ );
	for ( let i = 0; i < Math.max( a.length, b.length ); i++ ) {
		const x = parseInt( a[ i ] ?? '0', 10 );
		const y = parseInt( b[ i ] ?? '0', 10 );
		if ( Number.isNaN( x ) || Number.isNaN( y ) ) {
			return ( a[ i ] ?? '' ) < ( b[ i ] ?? '' ) ? 1 : -1;
		}
		if ( x !== y ) {
			return y > x ? 1 : -1;
		}
	}
	return 0;
}
