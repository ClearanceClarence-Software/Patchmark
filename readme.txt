=== Upload Diff ===
Contributors: cccode
Tags: plugin update, diff, security, changelog, upload
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

See exactly what a plugin zip changes before it replaces the installed copy: files, risky code, changelog and removed functions.

== Description ==

When you upload a zip for a plugin that is already installed, WordPress shows a small table (name, version, author, requirements) and a button to replace it. Upload Diff turns that screen into a proper review.

= Review =

Everything worth a second look, most serious first, each linked to the exact file and line:

* **Header changes**: older version than installed, same version with different files, a different plugin name or author, a new **Update URI** (future updates would come from somewhere else), new requirements, missing required plugins, a renamed main file (the plugin would be deactivated), a changed text domain.
* **Unusual files**: .htaccess and .user.ini, PHP files with odd extensions (.phtml, .phar, image.jpg.php), PHP in image or font folders, executables and shell scripts, bundled archives.
* **Risky code** that is new in the upload: eval and decode-and-run, shell commands, includes and unserialize of request data, long encoded strings, code that creates users or roles, new outgoing requests and new web addresses.

PHP is read with the tokenizer, so `$db->exec()` or "eval" in a comment is not mistaken for the real thing, and only code that was not in the installed copy of the same file is reported.

= Files =

* A folder tree of every added, removed, modified, moved and whitespace-only file, with line counts.
* Split or unified diffs with word highlights, folded context you can expand, and an option to ignore whitespace.
* Before and after previews for images.
* Filter by name or status, search inside the changed files, and step through files with j and k.
* **Download .patch**: a git-style patch of the text changes that `git apply` applies to the installed copy.

= Changelog =

The entries from readme.txt (or CHANGELOG.md) between the installed and the uploaded version, plus the Upgrade Notice for the new version. For a downgrade, the entries you would give up.

= API changes =

Functions, classes, public methods, hooks, REST routes, shortcodes, post types and blocks the upload adds or removes, plus Composer libraries that are added, removed or updated. Removed names are what breaks themes, snippets and other plugins that rely on them.

= Light =

Nothing runs except on the upload screen, and only when the plugin is already installed. Only files that changed are read. Nothing is stored in the database and nothing is sent anywhere; leaving the page discards the review.

A clean review is not a guarantee. Only install code from sources you trust.

== Installation ==

1. Install and activate Upload Diff.
2. Go to **Plugins › Add New › Upload Plugin** and upload a zip of a plugin you already have installed.
3. Read the review below WordPress's comparison table, then choose **Replace current with uploaded** or **Cancel and go back**.

== Frequently Asked Questions ==

= Where are the settings? =

There are none. The review appears on the upload screen when it has something to compare.

= Does it work for themes? =

Not yet. Plugins only.

= How large a plugin can it handle? =

Plugins with up to 20,000 files. A plugin like Formidable Forms (about 1,800 files, 29 MB) is compared in well under a second. Files over 512 KB, and anything past 8 MB of changed text, are compared and checked but their contents are not shown, to keep the page light.

= Is the code check a malware scanner? =

No. It points at changes worth reading. It can't prove a plugin is safe, and it reports things that are normal in some plugins (a membership plugin creates users).

== Screenshots ==

1. The review: what changes, most serious first, linked to files and lines.
2. The file browser with a split diff and word highlights.
3. Changelog entries between the two versions, with the upgrade notice.
4. API changes: removed and added functions, hooks and routes, and bundled libraries.

== Development ==

The files in build/ are compiled from TypeScript and SCSS but not minified, so you can read them as they are.

The source code and build setup are on GitHub: https://github.com/ClearanceClarence-Software/Upload-Diff

To build it yourself you need Node 20 or newer:

    npm ci
    npm run build

`npm run zip` makes the same plugin zip that's published here.

== Credits ==

Upload Diff bundles the Atkinson Hyperlegible Mono font (Copyright 2020-2024 The Atkinson Hyperlegible Next / Mono Project Authors), licensed under the SIL Open Font License 1.1. The license text is in the licenses/ folder. The font is served from the plugin folder, not from Google.

== Changelog ==

= 1.0.0 =
* First release: review, file browser with split and unified diffs, changelog and API changes on the "already installed" upload screen.
