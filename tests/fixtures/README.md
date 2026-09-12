# Fixtures

Almost nothing lives here, and that is the point.

The four PDFs this suite is built around — a font whose dictionary is its own
object, a sentence split across two text objects, a page that is only a picture,
a font with no map at all — are **built in code**, in `tests/_pdf.mjs`. They used
to be files in a temporary directory, and when that machine was recycled they
went with it: the checks around them stopped running and the suite stopped dead
on the first missing one. A fixture that is code cannot go missing, cannot drift
from the check it is for, and cannot be an absolute path into somebody's
scratchpad.

Each is a real PDF — a deflated content stream and a cross-reference table — so
any PDF tool can open them. That matters: without it, "my reader agrees with my
writer" would be the whole of the evidence that they are what they claim to be.

## What does belong here

`school.pdf` — a real school's calendar, if you want the last section of
`tests/pdftext.mjs` to run against one. It is **never committed**; the checks
skip and say so when it is absent. Drop a copy in and they run.
