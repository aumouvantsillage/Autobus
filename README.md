A graph/circuit router
======================

This is a JavaScript implementation of an automatic router for various kinds of diagrams
(graphs, electronic circuit schematics, etc).

The routing is based on the [A* pathfinding algorithm](https://en.wikipedia.org/wiki/A*_search_algorithm).
You can find an independent implementation of this algorithm in JavaScript
by Brian Grinstead in [his GitHub repository](https://github.com/bgrins/javascript-astar/).

Though my initial implementation was written with no knowledge of Brian's, I found that they were very similar,
maybe due to the fact that we used the same pseudo-code from the Wikipedia article as a starting point.
However, the most recent version benefits from improvements that I found in Brian's version such as
[the use of a binary heap](http://www.briangrinstead.com/blog/astar-search-algorithm-in-javascript-updated).

