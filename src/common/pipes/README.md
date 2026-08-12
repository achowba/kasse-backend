# common/pipes

Boundary conversions shared by every controller.

## What it does

`ParseObjectIdPipe` turns a path parameter into a Mongo `ObjectId` and rejects anything malformed with a `400`.

## Why it exists

Without it, a malformed identifier travels all the way to the database and surfaces as a cast error, which the exception filter can only report as a `500`. That is the wrong answer: the caller sent a bad request, and telling them so is both more accurate and more useful.

Converting at the boundary also means a service signature can take `Types.ObjectId` and trust it, rather than accepting a string and validating it again.

## How it relates to the rest of the project

Used by any controller with an id in its path.

## Endpoints

None.

## Dependencies on other modules

None.
