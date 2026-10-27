import { __, _n, sprintf } from '@wordpress/i18n';

import { num } from '../lib/format';
import type { Finding, Report } from '../types';
import { Dashicon, SEVERITY_ICONS } from './ui';

const SEVERITY_LABELS = {
	danger: __( 'Serious', 'ccs-upload-diff' ),
	warn: __( 'Check', 'ccs-upload-diff' ),
	info: __( 'Note', 'ccs-upload-diff' ),
};

export default function Findings( {
	report,
	onOpen,
}: {
	report: Report;
	onOpen: ( path: string, line?: number ) => void;
} ) {
	const { findings } = report;

	return (
		<div className="ccs-ud-findings">
			{ findings.length === 0 && (
				<div className="ccs-ud-callout is-ok">
					<Dashicon name="yes-alt" />
					<div>
						<strong>
							{ __(
								'Nothing unusual found.',
								'ccs-upload-diff'
							) }
						</strong>{ ' ' }
						{ __(
							'The header (name, author, version, update source, requirements, main file), file names and locations, and the changed code (eval, shell commands, decoding, request input, new web addresses, user and login changes) were checked. A clean review is not a guarantee: only install code from sources you trust.',
							'ccs-upload-diff'
						) }
					</div>
				</div>
			) }

			{ findings.length > 0 && (
				<ul className="ccs-ud-finding-list">
					{ findings.map( ( f ) => (
						<FindingItem
							key={ f.id }
							finding={ f }
							onOpen={ onOpen }
						/>
					) ) }
				</ul>
			) }

			{ ( report.truncated || report.omitted > 0 ) && (
				<p className="ccs-ud-note">
					{ report.truncated &&
						__(
							'One of the packages has more than 20,000 files; the rest were not compared.',
							'ccs-upload-diff'
						) }{ ' ' }
					{ report.omitted > 0 &&
						sprintf(
							/* translators: %s: number of files */
							_n(
								'The contents of %s file were left out of the viewer to keep the page light. It is still listed and was still checked.',
								'The contents of %s files were left out of the viewer to keep the page light. They are still listed and were still checked.',
								report.omitted,
								'ccs-upload-diff'
							),
							num( report.omitted )
						) }
				</p>
			) }
		</div>
	);
}

function FindingItem( {
	finding: f,
	onOpen,
}: {
	finding: Finding;
	onOpen: ( path: string, line?: number ) => void;
} ) {
	return (
		<li className={ `ccs-ud-finding is-${ f.severity }` }>
			<span className="ccs-ud-finding-icon">
				<Dashicon
					name={ SEVERITY_ICONS[ f.severity ] }
					label={ SEVERITY_LABELS[ f.severity ] }
				/>
			</span>
			<div className="ccs-ud-finding-body">
				<p className="ccs-ud-finding-title">{ f.title }</p>
				{ f.detail && (
					<p className="ccs-ud-finding-detail">{ f.detail }</p>
				) }
				{ f.refs.length > 0 && (
					<ul className="ccs-ud-refs">
						{ f.refs.map( ( r, i ) => (
							<li key={ `${ r.path }:${ r.label ?? '' }:${ i }` }>
								{ r.label && (
									<span className="ccs-ud-ref-label">
										{ r.label }
									</span>
								) }
								<button
									type="button"
									className="ccs-ud-ref"
									onClick={ () =>
										onOpen( r.path, r.lines?.[ 0 ] )
									}
								>
									{ r.path }
									{ r.lines?.length ? (
										<span className="ccs-ud-ref-line">
											:{ r.lines.join( ', ' ) }
										</span>
									) : null }
								</button>
								{ r.count &&
								r.count > ( r.lines?.length ?? 0 ) ? (
									<span className="ccs-ud-muted">
										{ sprintf(
											/* translators: %d: number of places */
											__(
												'%d places',
												'ccs-upload-diff'
											),
											r.count
										) }
									</span>
								) : null }
							</li>
						) ) }
						{ f.more > 0 && (
							<li className="ccs-ud-muted">
								{ sprintf(
									/* translators: %d: number of more files */
									__( 'and %d more', 'ccs-upload-diff' ),
									f.more
								) }
							</li>
						) }
					</ul>
				) }
			</div>
		</li>
	);
}
