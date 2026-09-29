# Mobile feed and comment fixes
Portrait short-post previews now cap at 1:1, retaining full width and the original image viewer. Landscape proportions and article thumbnail rules remain unchanged.

The shared viewport hook now flags keyboard visibility using editable focus and viewport shrinkage, excluding pinch zoom. Mobile primary navigation hides while the keyboard is visible and returns when it closes. Comment, reply and edit composers are marked so focus/viewport resizing can reveal the action row; manual viewport scrolling is never intercepted. Mobile comment inputs use 16px text to avoid iPhone focus zoom.

Validation: targeted viewport, image, composer and thread tests; TypeScript and ESLint. Real-device Safari keyboard verification remains necessary. Nothing deployed.
