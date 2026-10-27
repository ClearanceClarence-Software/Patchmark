import { useCallback, useMemo, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { KeyboardEvent } from 'react';

import ApiChanges, { apiCount } from './components/ApiChanges';
import Changelog from './components/Changelog';
import Files from './components/Files';
import Findings from './components/Findings';
import { Dashicon, Mark } from './components/ui';
import { bytes, num, sizeChange, versionDirection } from './lib/format';
import type { Report } from './types';

type Tab = 'review' | 'files' | 'changelog' | 'api';

export interface Target {
	path: string;
	line?: number;
	// Changes on every jump, so jumping to the same line twice still scrolls.
	seq: number;
}

export default function App( { report }: { report: Report } ) {
	const c = report.counts;
	const changed = c.added + c.removed + c.renamed + c.modified + c.whitespace;
	const danger = report.findings.filter(
		( f ) => f.severity === 'danger'
	).length;
	const warn = report.findings.filter(
		( f ) => f.severity === 'warn'
	).length;
	const api = apiCount( report.api );
	const changelogCount = report.changelog?.entries.length ?? 0;

	const [ tab, setTab ] = useState< Tab >(
		danger + warn > 0 || ! changed ? 'review' : 'files'
	);
	const [ target, setTarget ] = useState< Target | null >( null );
	const seq = useRef( 0 );

	const open = useCallback( ( path: string, line?: number ) => {
		setTarget( { path, line, seq: ++seq.current } );
		setTab( 'files' );
	}, [] );

	const { plugin } = report;
	const direction = versionDirection( plugin.oldVersion, plugin.newVersion );

	const tabs = useMemo(
		() => [
			{
				id: 'review' as const,
				label: __( 'Review', 'ccs-upload-diff' ),
				count: report.findings.length,
				tone: danger ? 'danger' : warn ? 'warn' : '',
			},
			{
				id: 'files' as const,
				label: __( 'Files', 'ccs-upload-diff' ),
				count: changed,
				tone: '',
			},
			{
				id: 'changelog' as const,
				label: __( 'Changelog', 'ccs-upload-diff' ),
				count: changelogCount,
				tone: '',
			},
			{
				id: 'api' as const,
				label: __( 'API changes', 'ccs-upload-diff' ),
				count: api.total,
				tone: api.removed ? 'warn' : '',
			},
		],
		[ report.findings.length, danger, warn, changed, changelogCount, api ]
	);

	const onTabKey = ( e: KeyboardEvent< HTMLDivElement > ) => {
		const i = tabs.findIndex( ( t ) => t.id === tab );
		let next = -1;
		if ( e.key === 'ArrowRight' ) {
			next = ( i + 1 ) % tabs.length;
		} else if ( e.key === 'ArrowLeft' ) {
			next = ( i - 1 + tabs.length ) % tabs.length;
		} else if ( e.key === 'Home' ) {
			next = 0;
		} else if ( e.key === 'End' ) {
			next = tabs.length - 1;
		}
		if ( next >= 0 ) {
			e.preventDefault();
			setTab( tabs[ next ].id );
			document
				.getElementById( `ccs-ud-tab-${ tabs[ next ].id }` )
				?.focus();
		}
	};

	let verdict;
	if ( danger ) {
		verdict = (
			<span className="ccs-ud-verdict is-danger">
				<Dashicon name="warning" />
				{ sprintf(
					/* translators: %d: number of serious findings */
					_n(
						'%d serious finding',
						'%d serious findings',
						danger,
						'ccs-upload-diff'
					),
					danger
				) }
			</span>
		);
	} else if ( warn ) {
		verdict = (
			<span className="ccs-ud-verdict is-warn">
				<Dashicon name="flag" />
				{ sprintf(
					/* translators: %d: number of findings to check */
					_n(
						'%d thing to check',
						'%d things to check',
						warn,
						'ccs-upload-diff'
					),
					warn
				) }
			</span>
		);
	} else {
		verdict = (
			<span className="ccs-ud-verdict is-ok">
				<Dashicon name="yes-alt" />
				{ __( 'Nothing unusual found', 'ccs-upload-diff' ) }
			</span>
		);
	}

	return (
		<div className="ccs-ud">
			<header className="ccs-ud-head">
				<div className="ccs-ud-brand">
					<Mark />
					<div>
						<h2 className="ccs-ud-title">
							{ __( 'What changes', 'ccs-upload-diff' ) }
						</h2>
						<p className="ccs-ud-sub">
							<span className="ccs-ud-version">
								{ plugin.oldVersion || '?' }
							</span>
							<Dashicon name="arrow-right-alt" />
							<span
								className={ `ccs-ud-version is-${
									direction > 0
										? 'up'
										: direction < 0
											? 'down'
											: 'same'
								}` }
							>
								{ plugin.newVersion || '?' }
							</span>
							<span className="ccs-ud-direction">
								{ direction > 0 &&
									__( 'upgrade', 'ccs-upload-diff' ) }
								{ direction < 0 &&
									__( 'downgrade', 'ccs-upload-diff' ) }
								{ direction === 0 &&
									__( 'same version', 'ccs-upload-diff' ) }
							</span>
						</p>
					</div>
				</div>
				{ verdict }
				<dl className="ccs-ud-stats">
					<div>
						<dt>{ __( 'Files changed', 'ccs-upload-diff' ) }</dt>
						<dd>
							{ num( changed ) }
							<span className="ccs-ud-muted">
								{ ' ' }
								{ sprintf(
									/* translators: %s: number of unchanged files */
									__( 'of %s', 'ccs-upload-diff' ),
									num( changed + c.unchanged )
								) }
							</span>
						</dd>
					</div>
					<div>
						<dt>{ __( 'Breakdown', 'ccs-upload-diff' ) }</dt>
						<dd className="ccs-ud-breakdown">
							<span className="is-added">
								+{ num( c.added ) }
							</span>
							<span className="is-modified">
								~{ num( c.modified + c.whitespace ) }
							</span>
							<span className="is-removed">
								−{ num( c.removed ) }
							</span>
							{ c.renamed > 0 && (
								<span className="is-renamed">
									↷{ num( c.renamed ) }
								</span>
							) }
						</dd>
					</div>
					<div>
						<dt>{ __( 'Size', 'ccs-upload-diff' ) }</dt>
						<dd>
							{ bytes( report.bytes.new ) }
							<span className="ccs-ud-muted">
								{ ' ' }
								(
								{ sizeChange(
									report.bytes.old,
									report.bytes.new
								) }
								)
							</span>
						</dd>
					</div>
				</dl>
			</header>

			{ /* eslint-disable-next-line jsx-a11y/interactive-supports-focus */ }
			<div
				className="ccs-ud-tabs"
				role="tablist"
				aria-label={ __( 'Upload review', 'ccs-upload-diff' ) }
				onKeyDown={ onTabKey }
			>
				{ tabs.map( ( t ) => (
					<button
						key={ t.id }
						id={ `ccs-ud-tab-${ t.id }` }
						type="button"
						role="tab"
						aria-selected={ tab === t.id }
						aria-controls={ `ccs-ud-panel-${ t.id }` }
						tabIndex={ tab === t.id ? 0 : -1 }
						className={ `ccs-ud-tab${ tab === t.id ? ' is-active' : '' }` }
						onClick={ () => setTab( t.id ) }
					>
						{ t.label }
						<span
							className={ `ccs-ud-count${ t.tone ? ` is-${ t.tone }` : '' }` }
						>
							{ num( t.count ) }
						</span>
					</button>
				) ) }
			</div>

			<div
				className="ccs-ud-panel"
				role="tabpanel"
				id={ `ccs-ud-panel-${ tab }` }
				aria-labelledby={ `ccs-ud-tab-${ tab }` }
			>
				{ tab === 'review' && (
					<Findings report={ report } onOpen={ open } />
				) }
				{ tab === 'files' && (
					<Files report={ report } target={ target } />
				) }
				{ tab === 'changelog' && <Changelog report={ report } /> }
				{ tab === 'api' && <ApiChanges api={ report.api } /> }
			</div>

			<p className="ccs-ud-foot">
				{ sprintf(
					/* translators: 1: milliseconds, 2: plugin folder */
					__(
						'Compared in %1$s ms. Folder: %2$s. Nothing is stored; leaving this page discards the review.',
						'ccs-upload-diff'
					),
					num( report.ms ),
					plugin.folder
				) }
			</p>
		</div>
	);
}
