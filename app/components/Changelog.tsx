import { __, sprintf } from '@wordpress/i18n';

import type { Report } from '../types';
import { Dashicon, Empty, Inline } from './ui';

export default function Changelog( { report }: { report: Report } ) {
	const log = report.changelog;
	const { oldVersion, newVersion } = report.plugin;

	if ( ! log || log.entries.length === 0 ) {
		return (
			<Empty
				icon="media-text"
				title={ __(
					'No changelog entries between these versions.',
					'ccs-upload-diff'
				) }
			>
				{ log
					? sprintf(
							/* translators: %s: file name */
							__(
								'%s has a changelog, but no entry for a version after the installed one.',
								'ccs-upload-diff'
							),
							log.source
						)
					: __(
							'The upload has no readme.txt or CHANGELOG.md to read it from.',
							'ccs-upload-diff'
						) }
			</Empty>
		);
	}

	return (
		<div className="ccs-ud-changelog">
			<p className="ccs-ud-note">
				{ log.downgrade
					? sprintf(
							/* translators: 1: installed version, 2: uploaded version, 3: file name */
							__(
								'Going back from %1$s to %2$s removes these changes (from the installed %3$s):',
								'ccs-upload-diff'
							),
							oldVersion,
							newVersion,
							log.source
						)
					: sprintf(
							/* translators: 1: installed version, 2: uploaded version, 3: file name */
							__(
								'Changes after %1$s, up to %2$s, from %3$s:',
								'ccs-upload-diff'
							),
							oldVersion || '?',
							newVersion || '?',
							log.source
						) }
			</p>

			{ log.notice && (
				<div className="ccs-ud-callout is-warn">
					<Dashicon name="megaphone" />
					<div>
						<strong>
							{ __( 'Upgrade notice:', 'ccs-upload-diff' ) }
						</strong>{ ' ' }
						<Inline text={ log.notice } />
					</div>
				</div>
			) }

			{ log.entries.map( ( entry, i ) => (
				<section
					className="ccs-ud-release"
					key={ `${ entry.heading }-${ i }` }
				>
					<h3>
						{ entry.version || entry.heading }
						{ entry.date && (
							<span className="ccs-ud-muted">
								{ ' ' }
								{ entry.date }
							</span>
						) }
					</h3>
					<ul>
						{ entry.lines.map( ( line, j ) =>
							line.type === 'group' ? (
								<li key={ j } className="ccs-ud-release-group">
									{ line.text }
								</li>
							) : (
								<li
									key={ j }
									className={
										line.type === 'text' ? 'is-text' : ''
									}
								>
									<Inline text={ line.text } />
								</li>
							)
						) }
					</ul>
				</section>
			) ) }

			{ log.more > 0 && (
				<p className="ccs-ud-note">
					{ sprintf(
						/* translators: %d: number of older entries */
						__(
							'%d older entries are not shown.',
							'ccs-upload-diff'
						),
						log.more
					) }
				</p>
			) }
		</div>
	);
}
