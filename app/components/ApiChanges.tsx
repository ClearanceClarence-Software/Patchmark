import { __, _n, sprintf } from '@wordpress/i18n';

import type { Report, SymbolKind } from '../types';
import { Dashicon, Empty } from './ui';

const KINDS: Array< [ SymbolKind, string ] > = [
	[ 'functions', __( 'Functions', 'patchmark' ) ],
	[ 'classes', __( 'Classes', 'patchmark' ) ],
	[ 'methods', __( 'Public methods', 'patchmark' ) ],
	[ 'hooks', __( 'Hooks it fires', 'patchmark' ) ],
	[ 'routes', __( 'REST routes', 'patchmark' ) ],
	[ 'shortcodes', __( 'Shortcodes', 'patchmark' ) ],
	[ 'post_types', __( 'Post types', 'patchmark' ) ],
	[ 'blocks', __( 'Blocks', 'patchmark' ) ],
];

type Api = Report[ 'api' ];

export function apiCount( api: Api ) {
	const count = ( side: Api[ 'added' ] ) =>
		Object.values( side ).reduce(
			( n, list ) => n + ( list?.length ?? 0 ),
			0
		);
	const removed = count( api.removed );
	return {
		removed,
		total: removed + count( api.added ) + api.libraries.length,
	};
}

const MAX_SHOWN = 40;

export default function ApiChanges( { api }: { api: Api } ) {
	const { total, removed } = apiCount( api );

	if ( total === 0 ) {
		return (
			<Empty
				icon="editor-code"
				title={ __(
					'No functions, classes, hooks or routes were added or removed.',
					'patchmark'
				) }
			>
				{ __(
					'Code that calls into this plugin, such as a theme or another plugin, keeps working as far as names go.',
					'patchmark'
				) }
			</Empty>
		);
	}

	return (
		<div className="pmk-api">
			{ removed > 0 && (
				<div className="pmk-callout is-warn">
					<Dashicon name="flag" />
					<div>
						<strong>
							{ sprintf(
								/* translators: %d: number of removed names */
								_n(
									'%d name is removed.',
									'%d names are removed.',
									removed,
									'patchmark'
								),
								removed
							) }
						</strong>{ ' ' }
						{ __(
							'A theme, snippet or other plugin that uses one of them will fail or silently stop working after the replacement. Search your site’s code for them first.',
							'patchmark'
						) }
					</div>
				</div>
			) }

			<div className="pmk-api-cols">
				<Side
					title={ __( 'Removed', 'patchmark' ) }
					tone="removed"
					data={ api.removed }
				/>
				<Side
					title={ __( 'Added', 'patchmark' ) }
					tone="added"
					data={ api.added }
				/>
			</div>

			{ api.libraries.length > 0 && (
				<section className="pmk-api-libs">
					<h3>
						{ __( 'Bundled libraries (Composer)', 'patchmark' ) }
					</h3>
					<table className="widefat striped">
						<thead>
							<tr>
								<th scope="col">
									{ __( 'Package', 'patchmark' ) }
								</th>
								<th scope="col">
									{ __( 'Installed', 'patchmark' ) }
								</th>
								<th scope="col">
									{ __( 'Uploaded', 'patchmark' ) }
								</th>
							</tr>
						</thead>
						<tbody>
							{ api.libraries.map( ( lib ) => (
								<tr key={ lib.name }>
									<td>
										<code>{ lib.name }</code>
									</td>
									<td>{ lib.from ?? '—' }</td>
									<td>
										{ lib.to ?? (
											<span className="pmk-muted">
												{ __( 'removed', 'patchmark' ) }
											</span>
										) }
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</section>
			) }

			<p className="pmk-note">
				{ __(
					'Read from the PHP in files that changed. Names built at runtime (for example hooks with a variable name) are shown as written in the code.',
					'patchmark'
				) }
				{ api.partial &&
					' ' +
						__(
							'Some very large files were not read.',
							'patchmark'
						) }
			</p>
		</div>
	);
}

function Side( {
	title,
	tone,
	data,
}: {
	title: string;
	tone: 'added' | 'removed';
	data: Api[ 'added' ];
} ) {
	const kinds = KINDS.filter( ( [ k ] ) => data[ k ]?.length );
	return (
		<section className={ `pmk-api-side is-${ tone }` }>
			<h3>{ title }</h3>
			{ kinds.length === 0 && (
				<p className="pmk-muted">{ __( 'Nothing', 'patchmark' ) }</p>
			) }
			{ kinds.map( ( [ kind, label ] ) => {
				const list = data[ kind ] ?? [];
				return (
					<div key={ kind } className="pmk-api-group">
						<h4>
							{ label }{ ' ' }
							<span className="pmk-muted">{ list.length }</span>
						</h4>
						<ul>
							{ list.slice( 0, MAX_SHOWN ).map( ( name ) => (
								<li key={ name }>
									<code>{ name }</code>
								</li>
							) ) }
							{ list.length > MAX_SHOWN && (
								<li className="pmk-muted">
									{ sprintf(
										/* translators: %d: number of more names */
										__( 'and %d more', 'patchmark' ),
										list.length - MAX_SHOWN
									) }
								</li>
							) }
						</ul>
					</div>
				);
			} ) }
		</section>
	);
}
