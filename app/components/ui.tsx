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

// The CC Software hex well, with a red and a green bar: two versions, side by side.
export function Mark( { size = 28 }: { size?: number } ) {
	return (
		<svg
			className="ccs-ud-mark"
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
				x="15"
				y="17.5"
				width="13"
				height="3.2"
				rx="1.6"
				fill="#f87171"
			/>
			<rect
				x="20"
				y="23.4"
				width="13"
				height="3.2"
				rx="1.6"
				fill="#4ade80"
			/>
			<rect
				x="15"
				y="29.3"
				width="9"
				height="3.2"
				rx="1.6"
				fill="#93c5fd"
			/>
		</svg>
	);
}

export const STATUS_LABELS: Record< Status, string > = {
	added: __( 'Added', 'ccs-upload-diff' ),
	removed: __( 'Removed', 'ccs-upload-diff' ),
	renamed: __( 'Moved', 'ccs-upload-diff' ),
	modified: __( 'Modified', 'ccs-upload-diff' ),
	whitespace: __( 'Whitespace only', 'ccs-upload-diff' ),
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
			className={ `ccs-ud-status is-${ status }` }
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
		<div className="ccs-ud-empty">
			<Dashicon name={ icon } />
			<p className="ccs-ud-empty-title">{ title }</p>
			{ children && (
				<div className="ccs-ud-empty-body">{ children }</div>
			) }
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
