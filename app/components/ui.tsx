import type { ReactNode } from 'react';

import type { Severity, Status } from '../types';
import { __ } from '@wordpress/i18n';

export function Dashicon( { name, label }: { name: string; label?: string } ) {
	return (
		<span
			className={ `dashicons dashicons-${ name }` }
			aria-hidden={ label ? undefined : true }
			aria-label={ label }
			role={ label ? 'img' : undefined }
		/>
	);
}

// The CC Software hex well, as in Routemark, holding a diff: a removed line, an added line
// that ends in Routemark's marker, and an unchanged line. Always graphite inside, so it works
// on light and dark backgrounds.
export function Mark( { size = 28 }: { size?: number } ) {
	return (
		<svg
			className="pmk-mark"
			width={ size }
			height={ size }
			viewBox="0 0 48 48"
			aria-hidden="true"
			focusable="false"
		>
			<path d="M24 2 43.05 13v22L24 46 4.95 35V13z" fill="#3b82f6" />
			<path
				d="M24 8.5 37.42 16.25v15.5L24 39.5 10.58 31.75v-15.5z"
				fill="#16181b"
			/>
			<rect
				x="14.5"
				y="16.6"
				width="13"
				height="3.2"
				rx="1.6"
				fill="#f87171"
			/>
			<rect
				x="14.5"
				y="22.4"
				width="13.5"
				height="3.2"
				rx="1.6"
				fill="#4ade80"
			/>
			<circle cx="32.2" cy="24" r="3.6" fill="#ffffff" />
			<circle cx="32.2" cy="24" r="1.5" fill="#1e40af" />
			<rect
				x="14.5"
				y="28.2"
				width="9"
				height="3.2"
				rx="1.6"
				fill="#93c5fd"
			/>
		</svg>
	);
}

export const STATUS_LABELS: Record< Status, string > = {
	added: __( 'Added', 'patchmark' ),
	removed: __( 'Removed', 'patchmark' ),
	renamed: __( 'Moved', 'patchmark' ),
	modified: __( 'Modified', 'patchmark' ),
	whitespace: __( 'Whitespace only', 'patchmark' ),
};

// One letter per status, as in git.
export const STATUS_LETTERS: Record< Status, string > = {
	added: 'A',
	removed: 'D',
	renamed: 'R',
	modified: 'M',
	whitespace: 'W',
};

export function StatusBadge( {
	status,
	short = false,
}: {
	status: Status;
	short?: boolean;
} ) {
	return (
		<span
			className={ `pmk-status is-${ status }` }
			title={ short ? STATUS_LABELS[ status ] : undefined }
		>
			{ short ? STATUS_LETTERS[ status ] : STATUS_LABELS[ status ] }
		</span>
	);
}

export const SEVERITY_ICONS: Record< Severity, string > = {
	danger: 'warning',
	warn: 'flag',
	info: 'info-outline',
};

export function Empty( {
	icon,
	title,
	children,
}: {
	icon: string;
	title: string;
	children?: ReactNode;
} ) {
	return (
		<div className="pmk-empty">
			<Dashicon name={ icon } />
			<p className="pmk-empty-title">{ title }</p>
			{ children && <div className="pmk-empty-body">{ children }</div> }
		</div>
	);
}

// `code`, **bold** and [links](https://…) from readme text, without any raw HTML.
export function Inline( { text }: { text: string } ) {
	const parts: ReactNode[] = [];
	const re =
		/`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ( ( m = re.exec( text ) ) ) {
		if ( m.index > last ) {
			parts.push( text.slice( last, m.index ) );
		}
		if ( m[ 1 ] ) {
			parts.push( <code key={ m.index }>{ m[ 1 ] }</code> );
		} else if ( m[ 2 ] ) {
			parts.push( <strong key={ m.index }>{ m[ 2 ] }</strong> );
		} else {
			parts.push(
				<a
					key={ m.index }
					href={ m[ 4 ] }
					target="_blank"
					rel="noreferrer noopener"
				>
					{ m[ 3 ] }
				</a>
			);
		}
		last = re.lastIndex;
	}
	if ( last < text.length ) {
		parts.push( text.slice( last ) );
	}
	return <>{ parts }</>;
}
