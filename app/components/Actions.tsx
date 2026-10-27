import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import type { CorePage } from '../lib/page';
import { Dashicon } from './ui';

// WordPress's own Cancel and Replace links, in the top bar. With serious findings, Replace
// takes a second click, so it is never pressed on the way to reading them.
export default function Actions( {
	page,
	serious,
}: {
	page: CorePage;
	serious: number;
} ) {
	const [ armed, setArmed ] = useState( false );
	const timer = useRef< number >( 0 );
	useEffect( () => () => window.clearTimeout( timer.current ), [] );

	const replace = page.replace;
	const onReplace = ( e: { preventDefault: () => void } ) => {
		if ( serious > 0 && ! armed ) {
			e.preventDefault();
			setArmed( true );
			timer.current = window.setTimeout( () => setArmed( false ), 5000 );
		}
	};

	return (
		<div className="pmk-actions">
			{ page.cancel && (
				<a className="button" href={ page.cancel.url }>
					{ page.cancel.label ||
						__( 'Cancel and go back', 'patchmark' ) }
				</a>
			) }
			{ replace ? (
				<a
					className={ `button button-primary${
						serious > 0 ? ' pmk-replace-risky' : ''
					}${ armed ? ' is-armed' : '' }` }
					href={ replace.url }
					onClick={ onReplace }
					aria-describedby={
						serious > 0 ? 'pmk-replace-hint' : undefined
					}
				>
					{ armed && <Dashicon name="warning" /> }
					{ armed
						? __( 'Click again to replace anyway', 'patchmark' )
						: replace.label ||
							__( 'Replace current with uploaded', 'patchmark' ) }
				</a>
			) : (
				<button
					type="button"
					className="button button-primary"
					disabled
				>
					{ __( 'Can’t replace', 'patchmark' ) }
				</button>
			) }
			{ serious > 0 && (
				<span id="pmk-replace-hint" className="screen-reader-text">
					{ __(
						'There are serious findings. Replacing takes a second click.',
						'patchmark'
					) }
				</span>
			) }
		</div>
	);
}
