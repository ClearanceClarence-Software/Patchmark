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
					'patchmark'
				) }
			>
				{ log
					? sprintf(
							/* translators: %s: file name */
							__(
								'%s has a changelog, but no entry for a version after the installed one.',
								'patchmark'
							),
							log.source
						)
					: __(
							'The upload has no readme.txt or CHANGELOG.md to read it from.',
							'patchmark'
						) }
			</Empty>
		);
	}

	return (
		<div className="pmk-changelog">
			<p className="pmk-note">
				{ log.downgrade
					? sprintf(
							/* translators: 1: installed version, 2: uploaded version, 3: file name */
							__(
								'Going back from %1$s to %2$s removes these changes (from the installed %3$s):',
								'patchmark'
							),
							oldVersion,
							newVersion,
							log.source
						)
					: sprintf(
							/* translators: 1: installed version, 2: uploaded version, 3: file name */
							__(
								'Changes after %1$s, up to %2$s, from %3$s:',
								'patchmark'
							),
							oldVersion || '?',
							newVersion || '?',
							log.source
						) }
			</p>

			{ log.notice && (
				<div className="pmk-callout is-warn">
					<Dashicon name="megaphone" />
					<div>
						<strong>
							{ __( 'Upgrade notice:', 'patchmark' ) }
						</strong>{ ' ' }
						<Inline text={ log.notice } />
					</div>
				</div>
			) }

			{ log.entries.map( ( entry, i ) => (
				<section
					className="pmk-release"
					key={ `${ entry.heading }-${ i }` }
				>
					<h3>
						{ entry.version || entry.heading }
						{ entry.date && (
							<span className="pmk-muted"> { entry.date }</span>
						) }
					</h3>
					<ul>
						{ entry.lines.map( ( line, j ) =>
							line.type === 'group' ? (
								<li key={ j } className="pmk-release-group">
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
				<p className="pmk-note">
					{ sprintf(
						/* translators: %d: number of older entries */
						__( '%d older entries are not shown.', 'patchmark' ),
						log.more
					) }
				</p>
			) }
		</div>
	);
}
