
/*
 * (exported)
 *
 * Returns a new rectangle object with the given boundaries.
 */
export function rect(left, top, right, bottom) {
    return {left, top, right, bottom};
}

/*
 * (exported)
 *
 * The Manhattan distance is the default distance function
 * for orthogonal routing.
 */
export function manhattanDistance(p, q) {
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
}

/*
 * (exported)
 *
 * The diagonal distance is the default distance function
 * for diagonal routing.
 */
export function diagonalDistance(p, q) {
    var dx = Math.abs(p.x - q.x);
    var dy = Math.abs(p.y - q.y);
    return Math.abs(dx - dy) + Math.min(dx, dy) * Math.SQRT2;
}

export class Router {
    /*
     * (exported)
     *
     * Constructs a new router with the given options.
     *
     * options = {                // Defaults:
     *      gridStep:  number,    // 10
     *      diagonal:  boolean,   // false
     *      bus:       boolean,   // false
     *      distance:  function,  // Manhattan
     *      turnCost:  number,    // 1.5 * gridStep
     *      busGain:   number,    // 0.5 * gridStep
     *      crossCost: number,    // 3   * gridStep
     *      proximityCost: number // 2  * gridStep
     * }
     */
    constructor(options) {
        this.options = options = options || {};

        options.gridStep      = options.gridStep || 10;
        options.diagonal      = !!options.diagonal;
        options.bus           = !!options.bus;
        options.distance      = options.distance || (options.diagonal ? diagonalDistance : manhattanDistance);
        options.margin        = "margin"        in options ? options.margin        : 2   * options.gridStep;
        options.turnCost      = "turnCost"      in options ? options.turnCost      : 1.5 * options.gridStep;
        options.busGain       = "busGain"       in options ? options.busGain       : 0.5 * options.gridStep;
        options.crossCost     = "crossCost"     in options ? options.crossCost     : 3   * options.gridStep;
        options.proximityCost = "proximityCost" in options ? options.proximityCost : 2   * options.gridStep;

        this.limits    = rect(0, 0, options.gridStep, options.gridStep);
        this.obstacles = [];
        this.routes    = [];
        this.allocate  = true;
    }

    /*
     * Add a new route to the current router.
     *
     * Parameters:
     *      start ({x, y})      - The starting point
     *      goal  ({x, y})      - The ending point
     *      onChange (function) - A function to call when a path has been recalculated for the route
     *
     * The router keeps references to the original "start" and "goal" objects.
     * When the coordinates are modified in these objects, re-routing will take the modifications
     * into account.
     * You can also define "x" and "y" as getters if the coordinates depend on other objects.
     */
    addRoute(start, goal, onChange) {
        this.routes.push({start, goal, onChange});
        this.extendLimits(rect(start.x, start.y, goal.x, goal.y));
    }

    /*
     * Add an obstacle to avoid when routing.
     *
     * Paramter:
     *      r {left, top, right, bottom} - A rectangle to avoid
     */
    addObstacle(r) {
        this.obstacles.push(r);
        this.extendLimits(r);

        // Compute the cost of passing through an obstacle
        const width  = this.limits.right  - this.limits.left;
        const height = this.limits.bottom - this.limits.top;
        this.obstacleCost = width * height / this.options.gridStep + width + height;
    }

    /*
     * Extend the limits of the exploration area to include
     * the given rectangle.
     */
    extendLimits(r) {
        if (r.left < this.limits.left + this.options.margin) {
            this.limits.left = r.left - this.options.gridStep;
            this.allocate = true;
        }
        if (r.right > this.limits.right - this.options.margin) {
            this.limits.right = r.right + this.options.margin;
            this.allocate = true;
        }
        if (r.top < this.limits.top + this.options.margin) {
            this.limits.top = r.top - this.options.margin;
            this.allocate = true;
        }
        if (r.bottom > this.limits.bottom - this.options.margin) {
            this.limits.bottom = r.bottom + this.options.margin;
            this.allocate = true;
        }
    }

    /*
     * Re-calculate paths for all routes managed by this router.
     */
    route() {
        this.initGrid();

        // Sort route definitions by increasing distance.
        // This must be done before each re-routing since some routes
        // may have changed in between.
        const dist = this.options.distance;
        this.routes.sort((a, b) => dist(a.start, a.goal) - dist(b.start, b.goal));

        this.routes.forEach((route, index) => {
            // Add a group Id to connected routes.
            // This must be done on each re-routing since some routes
            // may have changed in between.
            if (!("groupId" in route)) {
                // Use the index of the current route as a group Id
                route.groupId = index;
                // Find all routes connected to this route and assign them the same group Id
                propagateGroupId(this.routes, index);
            }

            // Find a path for the current route.
            route.onChange(route, this.findPath(route));
        });

        // Propagate the group Id of the given reference route to
        // all connected routes after the given route index.
        // All routes before and at refRouteIndex have already received a group Id.
        function propagateGroupId(routes, refIndex) {
            const refRoute = routes[refIndex];
            for (let i = refIndex + 1; i < routes.length; i ++) {
                const route = routes[i];
                if (!("groupId" in route) &&
                    (samePoint(route.start, refRoute.start) ||
                     samePoint(route.start, refRoute.goal)  ||
                     samePoint(route.goal,  refRoute.start) ||
                     samePoint(route.goal,  refRoute.goal))) {
                    route.groupId = refRoute.groupId;
                    propagateGroupId(routes, i);
                }
            }
        }
    }

    /*
     * Initialize the grid before re-calculating the paths for all routes.
     * The grid is allocated if the dimensions of the exploration area have
     * changed recently.
     */
    initGrid() {
        const columns = Math.floor((this.limits.right - this.limits.left) / this.options.gridStep) + 1;
        const rows    = Math.floor((this.limits.bottom - this.limits.top) / this.options.gridStep) + 1;

        if (this.allocate) {
            this.grid = new Array(columns);
        }

        for (let col = 0, x = this.limits.left; col < columns; col ++, x += this.options.gridStep) {
            if (this.allocate) {
                this.grid[col] = new Array(rows);
            }

            for (let row = 0, y = this.limits.top; row < rows; row ++, y += this.options.gridStep) {
                // If the current grid node is inside an obstacle,
                // set the "obstacle" property of the node.
                const obstacle = this.obstacles.some(
                    r => x >= r.left && x <= r.right  &&
                         y >= r.top  && y <= r.bottom
                );

                this.grid[col][row] = {
                    col, row,           // The coordinates of this node in the grid array
                    x, y,               // The coordinates of this node in the exploration area
                    obstacle,           // Is there an obstacle at this node?

                    // The following properties are updated during the pathfinding algorithm
                    g: 0,               // Cost from the start node to this node (g score)
                    f: 0,               // Estimated cost from the start node
                                        // to the goal node through this node (f score)
                    parent: null,       // The previous node in the current explored path
                    open: false,        // Does this node belong to the open set?
                    closed: false,      // Has this node already been processed?
                    groupCount: 0,      // The number of groups passing by this node
                    groups: {}          // A map of booleans indicating which groups pass by this node
                };
            }
        }

        this.allocate = false;
    }

    /*
     * Calculate a path for the given route.
     */
    findPath(route) {
        // Reset all nodes of the grid
        for (const col of this.grid) {
            for (const node of col) {
                node.parent  = null;
                node.visited = false;
                node.closed  = false;
            }
        }

        // Find the start and goal nodes closer to the start and goal of the route
        const startCol = Math.round((route.start.x - this.limits.left) / this.options.gridStep);
        const startRow = Math.round((route.start.y - this.limits.top)  / this.options.gridStep);
        route.start.node = this.grid[startCol][startRow];

        const goalCol = Math.round((route.goal.x - this.limits.left) / this.options.gridStep);
        const goalRow = Math.round((route.goal.y - this.limits.top)  / this.options.gridStep);
        route.goal.node = this.grid[goalCol][goalRow];

        // Compute the f score of the start node and add it to the open set
        route.start.node.f = this.options.distance(route.start.node, route.goal.node);
        const openSet = new BinaryHeap(node => node.f);
        openSet.push(route.start.node);

        route.start.node.open = true;

        let currentNode;
        while (openSet.size()) {
            // Move node with lowest f score from open set to closed set.
            currentNode = openSet.pop();

            // The exploration stops when reaching the goal node
            if (currentNode === route.goal.node) {
                break;
            }

            // Mark the current node as already processed
            currentNode.closed = true;

            // Get the list of neighbour nodes to explore.
            // A neighbour is included if it is compatible with the heading of the current node.
            const neighbours = this.getNeighbours(currentNode);

            for (const n of neighbours) {
                // Compute the g score of the neighbour with respect to the current node
                let g = currentNode.g + this.options.distance(currentNode, n);

                // Increase the g score if the neighbour makes a turn in the path
                if (currentNode.parent &&
                    (currentNode.x - currentNode.parent.x) * (n.y - currentNode.y) !==
                    (currentNode.y - currentNode.parent.y) * (n.x - currentNode.x)) {
                    g += this.options.turnCost;
                }

                // Increase the g score if the neighbour is part of an obstacle
                if (n.obstacle) {
                    g += this.obstacleCost;
                }

                // Increase the g score if the neighbour has neighbours in other groups
                // or if the neighbour is near an obstacle
                const otherNeighbours = this.getNeighbours(n);

                for (const q of otherNeighbours) {
                    if (!this.options.bus || !q.groups[route.groupId]) {
                        g += this.options.proximityCost * q.groupCount;
                    }
                    if (q.obstacle) {
                        g += this.options.proximityCost;
                    }
                }

                // Decrease the g score when reaching nodes already used by the same group.
                // Increase the g score when cutting routes of other groups.
                if (this.options.bus && n.groups[route.groupId]) {
                    g -= this.options.busGain;
                }
                else {
                    g += this.options.crossCost * n.groupCount;
                }

                // If the neighbour has not been visited
                // or if its g score has improved...
                if (!n.visited || g < n.g) {
                    // Add the neighbour node to the tree of candidate routes
                    n.parent = currentNode;

                    // Set or update the g and f scores of the neighbour
                    n.g = g;
                    n.f = g + this.options.distance(n, route.goal.node);

                    if (n.visited) {
                        openSet.rescoreElement(n);
                    }
                    else {
                        openSet.push(n);
                        n.visited = true;
                    }
                }
            }
        }

        // Update the grid and fill the output string with and SVG path definition
        const path = [];

        while (currentNode) {
            // Mark the current node as used by the routed signal
            if (!currentNode.groups[route.groupId]) {
                currentNode.groupCount ++;
                currentNode.groups[route.groupId] = true;
            }

            // Add one step the path data
            path.unshift({x: currentNode.x, y: currentNode.y});

            currentNode = currentNode.parent;
        }

        // Remove useless points
        for (let i = 1; i < path.length - 1;) {
            if ((path[i].x - path[i - 1].x) * (path[i + 1].y - path[i].y) ===
                (path[i].y - path[i - 1].y) * (path[i + 1].x - path[i].x)) {
                path.splice(i, 1);
            }
            else {
                i ++;
            }
        }

        // Align start and end segments to start and goal coordinates
        if (path.length > 1) {
            if (path[1].x === path[0].x) {
                path[1].x = route.start.x;
            }
            else if (path[1].y === path[0].y) {
                path[1].y = route.start.y;
            }

            if (path[path.length - 2].x === path[path.length - 1].x) {
                path[path.length - 2].x = route.goal.x;
            }
            else if (path[path.length - 2].y === path[path.length - 1].y) {
                path[path.length - 2].y = route.goal.y;
            }
        }

        path[0].x = route.start.x;
        path[0].y = route.start.y;

        path[path.length - 1].x = route.goal.x;
        path[path.length - 1].y = route.goal.y;

        return path;
    }

    /*
     * Get the neighbours of the given node than are acceptable
     * for routing, depending on the current coordinates and the
     * routing style (orthogonal or diagonal).
     */
    getNeighbours(node) {
        var left   = Math.max(node.col - 1, 0);
        var top    = Math.max(node.row - 1, 0);
        var right  = Math.min(node.col + 1, this.grid.length - 1);
        var bottom = Math.min(node.row + 1, this.grid[0].length - 1);

        const neighbours = [];

        for (let c = left; c <= right; c ++) {
            for (let r = top; r <= bottom; r ++) {
                // Skip the current node
                // Skip corners if diagonal routing is disabled
                if (c === node.col && r === node.row ||
                    c !== node.col && r !== node.row && !this.options.diagonal) {
                    continue;
                }

                var n = this.grid[c][r];

                if (!n.closed) {
                    neighbours.push(n);
                }
            }
        }

        return neighbours;
    }
};

/*
 * Returns true if two points have the same coordinates.
 */
function samePoint(p, q) {
    return p.x === q.x && p.y === q.y;
}

/*
 * An implementation of a binary heap.
 * See http://eloquentjavascript.net/appendix2.html
 */
class BinaryHeap {
    constructor(scoreFunction){
        this.content = [];
        this.scoreFunction = scoreFunction;
    }

    push(element) {
        // Add the new element to the end of the array.
        this.content.push(element);
        // Allow it to sink down.
        this.sinkDown(this.content.length - 1);
    }

    pop() {
        // Store the first element so we can return it later.
        var result = this.content[0];
        // Get the element at the end of the array.
        var end = this.content.pop();
        // If there are any elements left, put the end element at the
        // start, and let it bubble up.
        if (this.content.length > 0) {
            this.content[0] = end;
            this.bubbleUp(0);
        }
        return result;
    }

    remove(node) {
        var i = this.content.indexOf(node);
        // When it is found, the process seen in 'pop' is repeated
        // to fill up the hole.
        var end = this.content.pop();
        if (i !== this.content.length - 1) {
            this.content[i] = end;
            if (this.scoreFunction(end) < this.scoreFunction(node)) {
                this.sinkDown(i);
            }
            else {
                this.bubbleUp(i);
            }
        }
    }

    size() {
        return this.content.length;
    }

    rescoreElement(node) {
        this.sinkDown(this.content.indexOf(node));
    }

    sinkDown(n) {
        // Fetch the element that has to be sunk.
        var element = this.content[n];
        // When at 0, an element can not sink any further.
        while (n > 0) {
            // Compute the parent element's index, and fetch it.
            var parentN = ((n + 1) >> 1) - 1,
            parent = this.content[parentN];
            // Swap the elements if the parent is greater.
            if (this.scoreFunction(element) < this.scoreFunction(parent)) {
                this.content[parentN] = element;
                this.content[n] = parent;
                // Update 'n' to continue at the new position.
                n = parentN;
            }
            // Found a parent that is less, no need to sink any further.
            else {
                break;
            }
        }
    }

    bubbleUp(n) {
        // Look up the target element and its score.
        var length = this.content.length,
        element = this.content[n],
        elemScore = this.scoreFunction(element);
        while(true) {
            // Compute the indices of the child elements.
            var child2N = (n + 1) << 1,
            child1N = child2N - 1;
            // This is used to store the new position of the element, if any.
            var swap = null,
            child1Score;
            // If the first child exists (is inside the array)...
            if (child1N < length) {
                // Look it up and compute its score.
                var child1 = this.content[child1N];
                child1Score = this.scoreFunction(child1);
                // If the score is less than our element's, we need to swap.
                if (child1Score < elemScore){
                    swap = child1N;
                }
            }
            // Do the same checks for the other child.
            if (child2N < length) {
                var child2 = this.content[child2N],
                child2Score = this.scoreFunction(child2);
                if (child2Score < (swap === null ? elemScore : child1Score)) {
                    swap = child2N;
                }
            }
            // If the element needs to be moved, swap it, and continue.
            if (swap !== null) {
                this.content[n] = this.content[swap];
                this.content[swap] = element;
                n = swap;
            }
            // Otherwise, we are done.
            else {
                break;
            }
        }
    }
}
