export type Status =
	'added' | 'removed' | 'renamed' | 'modified' | 'whitespace';
export type Severity = 'danger' | 'warn' | 'info';

export interface FileEntry {
	path: string;
	status: Status;
	oldPath: string | null;
	oldSize: number | null;
	newSize: number | null;
	kind: 'text' | 'image' | 'binary';
	old?: string;
	new?: string;
	oldImage?: string;
	newImage?: string;
	// large: over the per-file limit; budget: left out to keep the page light.
	note?: 'large' | 'budget';
}

export interface Ref {
	path: string;
	status?: Status;
	lines?: number[];
	count?: number;
	label?: string;
}

export interface Finding {
	severity: Severity;
	id: string;
	title: string;
	detail: string;
	refs: Ref[];
	more: number;
}

export interface ChangelogLine {
	type: 'item' | 'text' | 'group';
	text: string;
}

export interface ChangelogEntry {
	heading: string;
	version: string;
	date: string;
	lines: ChangelogLine[];
}

export type SymbolKind =
	| 'functions'
	| 'classes'
	| 'methods'
	| 'hooks'
	| 'routes'
	| 'shortcodes'
	| 'post_types'
	| 'blocks';

export interface Report {
	plugin: {
		name: string;
		folder: string;
		oldVersion: string;
		newVersion: string;
	};
	counts: Record< Status | 'unchanged', number >;
	bytes: { old: number; new: number };
	truncated: boolean;
	omitted: number;
	findings: Finding[];
	changelog: {
		source: string;
		entries: ChangelogEntry[];
		more: number;
		notice: string;
		downgrade: boolean;
	} | null;
	api: {
		added: Partial< Record< SymbolKind, string[] > >;
		removed: Partial< Record< SymbolKind, string[] > >;
		libraries: Array< {
			name: string;
			from: string | null;
			to: string | null;
		} >;
		partial: boolean;
	};
	files: FileEntry[];
	ms: number;
}

declare global {
	interface Window {
		ccsUploadDiff?: Report | null;
	}
}
