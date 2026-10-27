// What WordPress printed on the "already installed" screen, read once so the viewer can show
// it in its own layout and then hide WordPress's version of it.

export interface CorePage {
	zip: string;
	replace: { url: string; label: string } | null;
	cancel: { url: string; label: string } | null;
	// "You are updating a plugin. Be sure to back up…", with its link.
	notice: {
		text: string;
		link: { href: string; label: string } | null;
	} | null;
	// Reasons WordPress refuses to replace the plugin (PHP or WordPress too old).
	blocked: string[];
}

export function readCorePage(): CorePage {
	const wrap = document.querySelector( '#wpbody-content .wrap' );
	const heading = wrap?.querySelector( 'h1' )?.textContent ?? '';
	// "Installing plugin from uploaded file: name.zip"
	const zip = heading.includes( ':' )
		? heading.slice( heading.lastIndexOf( ':' ) + 1 ).trim()
		: '';

	const replaceLink = wrap?.querySelector< HTMLAnchorElement >(
		'a.update-from-upload-overwrite'
	);
	const cancelLink = wrap?.querySelector< HTMLAnchorElement >(
		'a[href*="upload-plugin-cancel-overwrite"]'
	);

	const noticeEl = wrap?.querySelector( '.update-from-upload-notice' );
	const noticeLink = noticeEl?.querySelector< HTMLAnchorElement >( 'a' );

	const blocked = replaceLink
		? []
		: Array.from( wrap?.querySelectorAll( 'ul.ul-disc li' ) ?? [] )
				.map( ( li ) => li.textContent?.trim() ?? '' )
				.filter( Boolean );

	return {
		zip,
		replace: replaceLink
			? {
					url: replaceLink.href,
					label: replaceLink.textContent?.trim() ?? '',
				}
			: null,
		cancel: cancelLink
			? {
					url: cancelLink.href,
					label: cancelLink.textContent?.trim() ?? '',
				}
			: null,
		notice: noticeEl
			? {
					text: noticeEl.textContent?.trim() ?? '',
					link: noticeLink
						? {
								href: noticeLink.href,
								label: noticeLink.textContent?.trim() ?? '',
							}
						: null,
				}
			: null,
		blocked,
	};
}

// The full-page layout is switched on from here, so without JavaScript the regular WordPress
// screen stays as it is.
export function takeOver() {
	document.body.classList.add( 'pmk-takeover' );
	window.scrollTo( 0, 0 );
}
