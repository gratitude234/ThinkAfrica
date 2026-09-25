# Write redesign: Post composer and Article editor

Date: 2026-09-25
Status: implemented (see section 13 for where the build differs)
Source mockup: `Write Redesign (Standalone) (3).html` (Post composer, Article editor,
Reader preview and Publish settings; desktop 1440 and mobile 390x844)

## 1. Goal

Replace the single body-first canvas at `/write` with the two screens in the mockup:

- a **Post composer**: a small card with no title, one optional image and a Post button
  that publishes straight away;
- an **Article editor**: a full page with a cover, a required title, rich formatting and
  a Publish settings step.

Saving, drafts, device recovery, published edits and the server actions keep working
exactly as they do now. Only the interface changes, plus the few supporting changes
listed in sections 6 to 8.

"Done" means both screens match the mockup on desktop and mobile, with the decisions
below applied. Nothing already written is lost or changes kind, and `npm test`,
`npm run lint`, `npm run typecheck` and `npm run build` all pass.

## 2. Decisions

These came from the review of the mockup.

| Topic | Decision |
|---|---|
| Screens | Two screens. The Post composer's "Article" card switches to the Article editor. This replaces the "no type picker" rule. |
| Content rule | The writer chooses Post or Article. A title still makes a piece an Article, and that is what the database stores. |
| Sources, version history | Kept, in a ••• menu in the Article header. |
| Subtitle | Removed from the editor. The feed summary comes from the opening of the body. Existing pieces keep an excerpt someone wrote. |
| Image caption and alt text | A panel that appears while an image is selected. |
| Undo and redo | Kept, first in the mobile toolbar. The toolbar scrolls sideways because 44px buttons do not fit in 390px. |
| Recovery banner, autosave, drafts, published edit, server actions | Unchanged. |
| Post publishing | The Post button publishes straight away with no topics step. Only Articles go through Publish settings. |
| Character count | Not shown on either screen. |
| Title and heading font | Match the live article page (Newsreader), not the mockup's Bodoni. |
| Touch targets | 44px minimum everywhere. |
| Article placeholder | "Tell your story." |
| Desktop navigation | Shown above both screens on `/write`. There is no intercepting modal route. |
| Publish settings | Topics, then the word count and reading time line. There is no preview and no "In the feed" line. |

Decisions made while writing this spec, which need confirming at review:

- **D1. The Post's image is its `cover_image_url`.** The feed card and the Post page
  already show a Post's image from that column, so one field covers both. Switching to
  the Article editor turns it into the Article's cover.
- **D2. Most summaries are recomputed from the body.** An excerpt that is just the
  opening of the body is treated as generated, and only an excerpt someone actually
  wrote is kept. See section 7.
- **D3. `/edit/[slug]` stays full screen with no app navigation.** Only `/write` gets
  the navigation.
- **D4. Lists go in the desktop "+" menu.** The mockup's desktop toolbar has no way to
  make a list, so Bulleted list and Numbered list join Image and Divider in the "+" menu.
  On mobile they are under More, as in the mockup.
- **D5. A topic-page start keeps its topic.** A piece started from a topic page
  (`/write?tag=…`) still carries that topic, including when it is published as a Post.

## 3. What the codebase already does

- **Summaries for new pieces.** `publishContribution` sets
  `excerpt: snapshot.excerpt.trim() || deriveContributionExcerpt(content)`, so a new
  piece already gets a summary from its opening.
- **Summaries for published edits.** `savePublishedEditDraft` stores the excerpt exactly
  as the composer sends it, and `apply_post_edit_draft` copies it unchanged. There is no
  fallback here. Because the current composer hides the subtitle on Posts, editing a
  published Post leaves the feed showing its old opening.
- **The duplicated opening.** The live article page prints the excerpt under the title.
  A generated excerpt is the body's own opening, so an Article with no subtitle shows its
  first lines twice. Removing the subtitle field would make that true for every new
  Article.
- **Posts with no topic.** Nothing breaks. `topicKey()` in `lib/feedRanking.ts` already
  gives untagged pieces their own diversity key. `TopicLinks` in `HomeFeedCard` renders
  nothing when there are no topics, relevance scoring uses `tags ?? []`, and Explore's
  topics grid only counts tagged pieces.
- **Alignment is stripped today.** `sanitizePostHtml` keeps only `a[href]` and
  `img[alt,src,title]`, so any alignment would be removed on save.
  `injectHeadingIds` on the post page already copes with attributes on `h2` and `h3`.
- **Tiptap version.** `@tiptap/core` is 2.27.2 in `package-lock.json`, and
  `@tiptap/react` 2 already includes `BubbleMenu` and `FloatingMenu`.
- **A guard on the main layout.** `lib/publicationsFirstHome.test.ts` asserts that
  `app/(main)/layout.tsx` makes exactly one `.from(` call. Moving the lookup into
  `lib/navigationViewer.ts` moves that assertion there with it; the intent (one row, no
  RPC, on every navigation) is unchanged.
- **Tests that read the composer.** No existing test enforces "no type picker". The rule
  lives in the header comment of `lib/contentModel.ts`, in `docs/content-model.md` and in
  `CLAUDE.md`. `UniversalComposer.test.tsx` (542 lines) has 33 tests, some for behaviour
  this redesign removes, such as the subtitle, "Add title" and the six-control bottom bar.

## 4. Architecture

`UniversalComposer.tsx` is currently 1,133 lines. It holds the saving logic and the whole
interface, so it is split into small units:

```
app/(write)/write/
  page.tsx                  reads ?editor=article; adds avatar_url to the profile query
  UniversalComposer.tsx     root: owns the draft hook, picks the screen, shared dialogs
  useContributionDraft.ts   new: all saving and publishing state, moved out unchanged
  useModalFocus.ts          new: the focus trap, moved out; now returns focus on close
  PostComposer.tsx          new: the Post card
  ArticleEditor.tsx         new: the Article page
  ArticleMobileToolbar.tsx  new: the dark toolbar that sits on the keyboard
  ComposerMenu.tsx          new: the ••• menu both screens use
  WriteSheet.tsx            new: side panel on desktop, bottom sheet on a phone
  ImageDetailsPanel.tsx     new: caption and alt text for the selected image
  PublishSettingsDialog.tsx new: topics, the words and reading-time line, Publish
  ArticlePreview.tsx        changed: live page typography; hides a generated excerpt
app/(write)/layout.tsx      becomes a server layout that shows the navigation on desktop
app/(write)/WriteChrome.tsx new: the desktop navigation and search for /write
components/editor/Editor.tsx     changed: alignment, a variant prop, restyled menus
components/editor/extensions.ts  new: the editor schema, testable without React
components/editor/editorIcons.tsx new: the icons both toolbars draw
lib/sanitizePostHtml.ts     changed: allows text-align on p, h2 and h3
lib/contribution.ts         changed: isWrittenExcerpt()
lib/contentModel.ts         changed: rule text, plus composerSurfaceFor()
lib/uploadImage.ts          new: Editor's /api/upload-image call, taken out so the Post
                            composer can use it too
lib/navigationViewer.ts     new: the viewer lookup both layouts share
app/(main)/post/[slug]/page.tsx  changed: shows the excerpt only if someone wrote it
app/(write)/write/editActions.ts changed: fills in the summary when the excerpt is empty
```

### 4.1 `useContributionDraft` (the saving logic)

This hook takes everything in the current component that is not interface:

- the snapshot state;
- the device timer and the cloud timer;
- `persist` and `flush`;
- the scan for a device copy to recover;
- the reset when a different document arrives;
- `finishPublication`;
- the leave-and-discard flow;
- the save label.

It moves code without changing what it does. The props are the same as the current
component's.

It returns:

```ts
{
  snapshot, setSnapshot,
  saveState, saveLabel, saveError,
  recovery, restoreRecovery(), dismissRecovery(),
  draftId, editDraftId, documentKey,
  flush(options?: { force?: boolean }): Promise<boolean>,
  requestClose(), publish(), publishing,
  discardDraft(), discarding,
  wordCount, bodyText,
}
```

`flush({ force: true })` saves as soon as `hasMeaningfulContribution` is true. It skips
the `deservesCloudDraft` minimum, which exists to stop stray keystrokes becoming drafts.
Save draft is a deliberate action, so the minimum does not apply to it.

`discardDraft()` has three cases:

- **Published edit:** it calls `discardPublishedEditDraft` (as today) and goes to the
  post.
- **A draft that has been saved to the account:** it calls
  `deleteOwnDraftPosts({ postIds: [draftId] })`, clears the device copy and goes to
  `returnTo`.
- **No draft saved yet:** it clears the device copy and goes to `returnTo`.

### 4.2 `UniversalComposer` (the root)

The component keeps its name and props, so `page.tsx` and `/edit/[slug]` do not change
how they call it. It adds one prop, `initialSurface?: "post" | "article"`.

It holds `surface` in state, set at the start by `composerSurfaceFor()` (section 8), and
records whether the Article editor was opened from the Post composer during this visit.
It renders:

- the recovery banner;
- `PostComposer` or `ArticleEditor`, each given the hook's values;
- the leave dialog, the discard confirmation and `ProfileGate`, which both screens share.

**Switching from Post to Article.** Set `surface = "article"`. Use
`history.replaceState` to add `editor=article` to the address, keeping any `draft`
parameter, so a refresh stays in the Article editor. Then move focus to the title. The
snapshot carries over as it is, and the Post's image becomes the cover (D1).

**Back in the Article editor.** If the editor was opened from the Post composer during
this visit and the title is still empty, Back returns to the Post composer and removes
`editor=article`. Otherwise it calls `requestClose()`, the same way Close works today.

**One rule that always holds:** the Post composer is only ever shown when the title is
empty, so a Post never publishes with a title nobody can see. A test checks this.

### 4.3 `PostComposer`

**Desktop (from md, 768px, up).** Navigation at the top. The page background is
`canvas`. A card 560px wide sits centred with 56px of space above it.

**Mobile.** Full screen: header, body and a bottom bar with the image button. The bottom
bar sits on top of the keyboard, using `--mobile-visual-viewport-bottom`.

The header has four parts:

- **Cancel** calls `requestClose()`.
- **The title** reads "New post", or "Edit post" when editing something published.
- **••• menu** has three items:
  - **Drafts** links to `/{username}?tab=drafts` and is hidden when there is no
    username.
  - **Save draft** runs `flush({ force: true })`.
  - **Discard** opens a confirmation, then runs `discardDraft()`. When editing something
    published, it reads "Discard changes" and appears only once there is an edit draft.
- **The Post button** reads "Post", or "Update" when editing something published. It is
  disabled while the body has no text or an image is uploading. Pressing it:
  - opens `ProfileGate` if the writer's name or username is missing;
  - otherwise calls `publish()` directly, with no sheet.

The save status appears next to the menu on desktop, and as a line under the header on
mobile. Its wording is the same as today's.

The body has four parts:

- **Byline.** The writer's avatar (`avatar_url`, falling back to their initial) and name.
- **Editor.** `Editor` with `variant="post"`. There is no selection toolbar and no "+"
  menu, and images are not placed inside the text. Any formatting already in an older Post
  survives, because the editor still has the full set of text formats even though none
  are shown. The placeholder is "Share an idea, a link, a moment."
- **Image.** Adding one uploads with `uploadImage()` and sets `coverImageUrl`. It is shown
  at its natural shape (`object-contain`, at most 420px tall) with a 44px "Remove image"
  button. Pasting or dropping an image file into the body sets the Post's image instead
  of placing it in the text.
- **Article card.** A button reading "Article" with the line "Write something in depth".
  On mobile it shrinks to the one word "Article" once the body has text. Pressing it
  switches to the Article editor.

### 4.4 `ArticleEditor`

**Header bar.** It sticks below the app navigation on desktop and to the top of the
screen on mobile. It contains, in order:

- ← Back;
- the save status (a gold dot and "Saved", or whatever the current status is);
- the ••• menu (`ArticleMenu`);
- **Preview**, which opens the full reader preview and is disabled while the body is
  empty;
- **Continue**, or **Update Article** when editing something published.

On mobile, the save status moves to a second row of the header. The mockup also puts
**Add cover** in that row; it stays at the top of the writing area instead, so the page
has one uploader and one status region rather than a copy of each per screen size.

Continue is enabled only when the title and the body both have text and nothing is
uploading. Pressing it opens `ProfileGate` if the profile is incomplete; otherwise it
opens Publish settings.

**The writing area** is 680px wide on desktop. From top to bottom:

1. **Add cover.** This is `CoverImageUploader` in its compact form, and shows the cover
   with a Remove button once one is added.
2. **Title.** A textarea that grows with its text, using the live page's
   `publication-article-title` type. The placeholder is "Title".
3. **Missing-title message.** When the body has text and the title is empty, the text
   "Add a title to continue. An Article needs one, a Post never does." appears. The title
   field refers to it through `aria-describedby`.
4. **Body.** `Editor` with `variant="article"`, using the live page's
   `publication-article-body` type, so what you write looks like what gets published.
   The placeholder is "Tell your story."

**Selection toolbar (desktop, not touch).** This is the existing `BubbleMenu`,
restyled: an `emerald-brand` background with light text, a 6px radius and a shadow. The
buttons are, in order: Bold, Italic, Link, H2, H3, Quote, Align. Link opens the URL field
that already exists. Align opens a small white menu with four buttons (Align left, Align
centre, Align right, Justify), and the current one is marked as pressed. Because this
toolbar only appears when a mouse or trackpad is in use, its buttons can be 36px. Mobile
toolbars still use 44px.

**"+" menu (desktop).** Tiptap's `FloatingMenu` shows a round 44px "+" button next to an
empty paragraph. It opens a menu with Image, Divider, Bulleted list and Numbered list
(D4).

**Mobile toolbar (`ArticleMobileToolbar`).** It sits on the keyboard and uses the
`emerald-brand` colour. It scrolls sideways, and every button is 44px. The buttons are,
in order:

- Undo, Redo, Bold, Italic, Link, H2, Quote, More, "+".
- **More** opens H3, Bulleted list, Numbered list and the four alignment buttons.
- **"+"** opens Image and Divider.
- **Link** swaps the row for a URL field with Apply and Cancel.

**••• menu (`ComposerMenu`, shared with the Post composer, which shows only its last
three items).** It has five items:

- **Sources.** Shows the number of sources when there are any, and opens a sheet
  holding `ReferencesPanel`.
- **Version history.** Only for a draft saved to the account, not when editing something
  published. It opens a sheet holding `RevisionHistory`.
- **Drafts.**
- **Save draft.**
- **Discard.** Reads "Discard changes" when editing something published.

The sheets are a right-hand panel 420px wide on desktop and a bottom sheet on mobile.
Both trap focus with `useModalFocus`. Placing a citation still puts it where the cursor
was, because ProseMirror remembers the selection while the sheet is open.

**`ImageDetailsPanel`.** While an image is selected, a small card appears: fixed at the
bottom of the writing column on desktop, and just above the toolbar on mobile. It holds
the Caption and Alt text fields from today's panel, with the same labels and help text.

### 4.5 `PublishSettingsDialog` (Articles only)

On desktop it is a 480px dialog in the middle of the screen; on mobile it is a bottom
sheet with a grab handle. It contains:

- the heading "Publish settings";
- "Topics", using `TagInput` with at most 5 topics;
- the line "1,240 words · 6 min read";
- any error;
- a footer with **Cancel** and **Publish**, or **Update** when editing something
  published.

Cmd or Ctrl+Enter publishes, as it does today. Escape closes the dialog unless it is in
the middle of publishing.

### 4.6 `ArticlePreview` and the reader preview

The existing full-screen preview overlay stays. `ArticlePreview` switches to the live
page's styling:

- `publication-article-title` for the title (36px, 44px from `sm` up);
- `publication-article-body` for the body;
- the excerpt under the title only when `isWrittenExcerpt()` is true;
- a byline: avatar, name, "N words", "N min read";
- a 16:9 cover when there is one;
- topic chips at the end.

The compact variant, used only by the old publish sheet, is removed.

### 4.7 `Editor.tsx`

- **New prop.** `variant: "post" | "article"` replaces `canvasMode`. It decides:
  - the CSS class;
  - whether the selection toolbar and the "+" menu are shown (article only);
  - whether images can be placed in the text (article only);
  - where a pasted or dropped image goes. It takes a new `onImageFile(file)` callback,
    and in the Post variant a file goes to that callback.
- **Alignment.** Add `TextAlign.configure({ types: ["heading", "paragraph"],
  alignments: ["left", "center", "right", "justify"], defaultAlignment: "left" })`.
- **`EditorHandle`.** Add `setTextAlign(value)` and `getTextAlign()`.
- **`isActive` for alignment.** `isActive({ textAlign })` works through the existing
  `isActive(name, attrs)`.

### 4.8 `/write` layout and navigation

`app/(write)/layout.tsx` becomes a server component. It reads the session and profile
the same way `app/(main)/layout.tsx` does. That lookup is moved into a shared
`lib/navigationViewer.ts` so the two layouts cannot drift apart. The layout then renders
a client `WriteChrome`, which holds:

- `NavClient` from md up, in a `hidden md:contents` wrapper so the nav's own sticky
  positioning still works against the page;
- a `SearchOverlay` for the nav's search button;
- a call to `useVisualViewportBottom()`, as the layout does today;
- the page itself.

There is no `AppChromeProvider` here. `NavClient` falls back to a fixed, always-shown
nav without one, which is what a writing screen wants, and the Article header sticks at
`--app-nav-height` below it.

## 5. What each screen does

- **Choosing the screen on load.** `composerSurfaceFor({ title, requested })` decides.
  A piece with a title always opens in the Article editor, `editor=article` opens the
  Article editor, and anything else opens the Post composer. Drafts listed on the
  profile link to `/write?draft=id`, so an untitled draft opens as a Post, and the
  Article card is one tap away.
- **Old links.** `kind` and `type` stay in `RETIRED_PARAMS`. The new parameter is
  `editor`.
- **Published edits.** `/edit/[slug]` opens the Article editor when the piece has a
  title and the Post composer when it does not. It passes the same props as today.
- **Saving and recovery.** Unchanged. The hook is the old code moved to a new file.
- **Leaving with an unsaved account copy.** The existing "Your account copy didn't save"
  dialog is kept exactly as it is.

## 6. Alignment from editor to published page

1. **Install.** `@tiptap/extension-text-align@2.27.2`, the same version as `@tiptap/core`.
2. **Sanitizer.** In `sanitizePostHtml`, add `allowedAttributes` of `style` for `p`,
   `h2` and `h3`, and
   `allowedStyles: { p|h2|h3: { "text-align": [/^(left|center|right|justify)$/] } }`.
   Every other style property and any other value is removed, and `style` on any other
   tag is removed. Pieces already saved contain no `style` attributes, so their HTML does
   not change.
3. **CSS.** Justified paragraphs get `hyphens: auto` inside `.publication-article-body`,
   `.publication-post-body`, `.write-canvas-editor` and the preview body. The selectors
   match both `text-align: justify` (how the editor writes it) and `text-align:justify`
   (how the sanitizer writes it). `<html lang="en">` is already set, which the browser
   needs before it will hyphenate.

## 7. Feed summary (excerpt)

Add `isWrittenExcerpt(excerpt, content)` to `lib/contribution.ts`. It is true when the
excerpt, with whitespace collapsed and any trailing "…" removed, is not empty and is not
the start of `contributionText(content)`.

It is used in four places:

1. **The live article page** shows the excerpt under the title only when it is true.
   This removes the duplicated opening.
2. **`ArticlePreview`** follows the same rule.
3. **`/edit/[slug]`** starts with `excerpt: ""` when the saved excerpt is not a written
   one, so the summary is generated again from the edited body (D2).
4. **`savePublishedEditDraft`** stores
   `excerpt.trim() || deriveContributionExcerpt(sanitizedContent)`. This is the fallback
   that editing a published piece was missing.

A written excerpt is kept everywhere. Known limitation: a generated excerpt whose body
was later edited no longer starts the body, so it counts as written and is kept. That is
what happens today, so this is no worse.

## 8. Content model text

- **`lib/contentModel.ts`.** The header comment becomes: the writer chooses Post or
  Article by choosing the screen they write in, and a title still makes a piece an
  Article, which is the only thing the database stores.
- **New function.** Add
  `composerSurfaceFor({ title, requested }): ContentKind`, which returns `"article"` when
  the title has text, then `requested` if it is a valid kind, and `"post"` otherwise.
- **`lib/contentModel.test.ts`.** Reword the rule test to "a title makes it an Article,
  whichever screen it was written on", and add tests for `composerSurfaceFor`.
- **Documentation.** Update the sentences in `CLAUDE.md` ("The title decides which one a
  piece is"; "There is no type picker") and in the superseded note at the top of
  `docs/content-model.md` to match.

## 9. Accessibility

- Every touch control is at least 44px. The selection toolbar, which appears only with a
  mouse or trackpad, is at least 36px.
- The toolbars use `role="toolbar"` with a label. Formatting buttons use `aria-pressed`.
  The alignment buttons are labelled "Align left", "Align centre", "Align right" and
  "Justify".
- Menus are buttons with `aria-expanded`. Escape closes them, and focus returns to the
  button that opened them.
- Dialogs and sheets use `useModalFocus`.
- The save status stays in an `aria-live="polite"` region.
- The missing-title message is linked to the title field.
- All interface text follows the Product Voice rules in `CLAUDE.md`, including no em
  dashes.

## 10. Testing

**Unit tests (Vitest):**

- `sanitizePostHtml`:
  - keeps `text-align` on `p`, `h2` and `h3`;
  - removes other style properties and values not on the list;
  - removes `style` on other tags;
  - the existing tests still pass.
- `contribution`: `isWrittenExcerpt` with a generated excerpt, a written one, an empty
  one, and one ending in an ellipsis.
- `contentModel`: `composerSurfaceFor`, plus the reworded rule test.
- `editActions`: an empty excerpt is filled in from the body; a written one is kept.

**Component tests.** These replace `UniversalComposer.test.tsx`.

- `UniversalComposer.test.tsx` keeps the 13 autosave, recovery and draft-tidiness tests
  against the root component, and adds tests for choosing the screen, switching, Back,
  and the rule that a Post never has a title.
- `PostComposer.test.tsx` covers:
  - Post publishing directly;
  - the button being disabled with an empty body;
  - adding and removing the image;
  - the image moving to the cover when switching;
  - Save draft forcing a save;
  - Discard with its confirmation;
  - the Article card shrinking once there is text.
- `ArticleEditor.test.tsx` covers:
  - Continue being enabled only with a title and body;
  - the missing-title message;
  - the ••• menu with sources and history;
  - the image details panel;
  - the order of the mobile toolbar, starting with Undo and Redo;
  - alignment calls to the editor;
  - Update Article when editing something published.
- `PublishSettingsDialog.test.tsx` covers topics, the words line, Cmd+Enter, and Escape
  while publishing.

**Tests to retire.** Ten tests describe removed behaviour and are deleted along with it:

- subtitle (3): "takes the subtitle with the title", "writes the subtitle on the
  canvas", "offers no subtitle until there is a title";
- "Add title" (2): "starts body-first with an optional title", "adds a title without
  leaving the same canvas";
- the six-control bar (1);
- the format drawer (2): "opens one drawer at a time", "labels the format row";
- the compact preview in the publish sheet (2): "cloud-saves untitled body text and
  opens one compact publish preview", "calls a titled piece a full article".

**Tests to port.** The other 10 "canvas polish" tests (sources, undo, caption and alt
text, the preview, the words line, Cmd+Enter, bare Enter, the upload status, the save
label, drafts left to the profile) move to the new component test files and are
rewritten for the new layout.

**Manual check.** With `npm run dev`, check `/write` at 1440 and 390 wide in browser
developer tools. On a real phone, check that the toolbar stays on the keyboard. Then run
`npm test`, `npm run lint`, `npm run typecheck` and `npm run build`.

## 11. Not in this project

- An intercepting modal route.
- Navigation on `/edit/[slug]`.
- A character count.
- Database migrations. None are needed.
- Server action changes, apart from the excerpt fallback.
- Undo buttons on desktop, where Cmd+Z already works.
- Grouping images or galleries in Posts.

## 12. Phases

Each phase ends with every test passing and the app working.

1. **Alignment.** Install the extension, change the sanitizer and add its tests, add the
   editor handle methods and the CSS. The toolbars that use it arrive in phase 4.
2. **Groundwork.** `isWrittenExcerpt`, the change to the live page, the `/edit`
   starting excerpt, the edit fallback, the content model text and `composerSurfaceFor`,
   and the documentation.
3. **Take out the saving logic.** Move the saving logic into `useContributionDraft`
   without changing the interface. The existing composer tests are the check that
   nothing changed.
4. **Article editor.** Build `uploadImage`, the `Editor` variant, `ArticleEditor` and
   everything it uses, plus the preview changes, each with its tests. It is not connected
   to anything yet.
5. **Post composer and switch-over.** Build `PostComposer`, the root's screen choice,
   `page.tsx`, the `/write` layout with navigation and `lib/navigationViewer`. Connect
   both screens, remove the old canvas and its retired tests.
6. **Tidy up.** Update the `CLAUDE.md` notes on the composer, then run the manual check
   and the full check.

## 13. As built

D1 to D5 were taken as written. Where the build differs from sections 4 to 6:

- **Left alignment writes nothing.** Tiptap's TextAlign writes `text-align: left`
  on every paragraph once left is the default, which would have rewritten every
  saved piece. `components/editor/extensions.ts` extends it so the default is
  rendered as no style.
- **Closer to the mockup than the plan.** The selection toolbar and the phone
  toolbar use the mockup's text labels (B, I, Link, H2, H3, the quote mark,
  More, +). On a phone, More and + open small white menus above the bar rather
  than replacing a row of it. The Post composer puts the image button on its
  own row and the Article card full width beneath it, and on a phone the image
  button moves to the bar on the keyboard. Publish settings has Cancel on the
  left and Publish on the right, and the missing-title message is red.
- **The cover shows at full size** once added, instead of the compact uploader's
  thumbnail.
- **Editor menus hide reliably.** Tiptap's own hide-on-blur is defeated by
  buttons that keep focus in the body, so the menus now also hide on a click
  outside them or on focus moving elsewhere, and Escape closes the + menu and
  the alignment choices.
- **Cmd+Enter in the Post composer** is taken before the editor sees it, since
  Tiptap binds the same keys to a line break.
- **Not changed:** the remove button on a topic chip in the shared `TagInput`
  is below 44px. It is used across the app, so it is left for its own change.
