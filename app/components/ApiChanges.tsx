import { __, _n, sprintf } from '@wordpress/i18n';

import type { Report, SymbolKind } from '../types';
import { Dashicon, Empty } from './ui';

const KINDS: Array< [ SymbolKind, string ] > = [
	[ 'functions', __( 'Functions', 'ccs-upload-diff' ) ],
	[ 'classes', __( 'Classes', 'ccs-upload-diff' ) ],
	[ 'methods', __( 'Public methods', 'ccs-upload-diff' ) ],
	[ 'hooks', __( 'Hooks it fires', 'ccs-upload-diff' ) ],
	[ 'routes', __( 'REST routes', 'ccs-upload-diff' ) ],
	[ 'shortcodes', __( 'Shortcodes', 'ccs-upload-diff' ) ],
	[ 'post_types', __( 'Post types', 'ccs-upload-diff' ) ],
	[ 'blocks', __( 'Blocks', 'ccs-upload-diff' ) ],
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
					'ccs-upload-diff'
				) }
			>
				{ __(
					'Code that calls into this plugin, such as a theme or another plugin, keeps working as far as names go.',
					'ccs-upload-diff'
				) }
			</Empty>
		);
	}

	return (
		<div className="ccs-ud-api">
			{ removed > 0 && (
				<div className="ccs-ud-callout is-warn">
					<Dashicon name="flag" />
					<div>
						<strong>
							{ sprintf(
								/* translators: %d: number of removed names */
								_n(
									'%d name is removed.',
									'%d names are removed.',
									removed,
									'ccs-upload-diff'
								),
								removed
							) }
						</strong>{ ' ' }
						{ __(
							'A theme, snippet or other plugin that uses one of them will fail or silently stop working after the replacement. Search your site’s code for them first.',
							'ccs-upload-diff'
						) }
					</div>
				</div>
			) }

			<div className="ccs-ud-api-cols">
				<Side
					title={ __( 'Removed', 'ccs-upload-diff' ) }
					tone="removed"
					data={ api.removed }
				/>
				<Side
					title={ __( 'Added', 'ccs-upload-diff' ) }
					tone="added"
					data={ api.added }
				/>
			</div>

			{ api.libraries.length > 0 && (
				<section className="ccs-ud-api-libs">
					<h3>
						{ __(
							'Bundled libraries (Composer)',
							'ccs-upload-diff'
						) }
					</h3>
					<table className="widefat striped">
						<thead>
							<tr>
								<th scope="col">
									{ __( 'Package', 'ccs-upload-diff' ) }
								</th>
								<th scope="col">
									{ __( 'Installed', 'ccs-upload-diff' ) }
								</th>
								<th scope="col">
									{ __( 'Uploaded', 'ccs-upload-diff' ) }
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
											<span className="ccs-ud-muted">
												{ __(
													'removed',
													'ccs-upload-diff'
												) }
											</span>
										) }
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</section>
			) }

			<p className="ccs-ud-note">
				{ __(
					'Read from the PHP in files that changed. Names built at runtime (for example hooks with a variable name) are shown as written in the code.',
					'ccs-upload-diff'
				) }
				{ api.partial &&
					' ' +
						__(
							'Some very large files were not read.',
							'ccs-upload-diff'
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
		<section className={ `ccs-ud-api-side is-${ tone }` }>
			<h3>{ title }</h3>
			{ kinds.length === 0 && (
				<p className="ccs-ud-muted">
					{ __( 'Nothing', 'ccs-upload-diff' ) }
				</p>
			) }
			{ kinds.map( ( [ kind, label ] ) => {
				const list = data[ kind ] ?? [];
				return (
					<div key={ kind } className="ccs-ud-api-group">
						<h4>
							{ label }{ ' ' }
							<span className="ccs-ud-muted">
								{ list.length }
							</span>
						</h4>
						<ul>
							{ list.slice( 0, MAX_SHOWN ).map( ( name ) => (
								<li key={ name }>
									<code>{ name }</code>
								</li>
							) ) }
							{ list.length > MAX_SHOWN && (
								<li className="ccs-ud-muted">
									{ sprintf(
										/* translators: %d: number of more names */
										__( 'and %d more', 'ccs-upload-diff' ),
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
