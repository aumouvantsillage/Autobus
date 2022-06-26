
/*
 * Returns a new rectangle object with the given boundaries.
 */
export function rect(left, top, right, bottom) {
    return {left: left, top: top, right: right, bottom: bottom};
}

/*
 * The Manhattan distance is the default distance function
 * for orthogonal routing.
 */
export function manhattanDistance(p, q) {
    return Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
}

/*
 * The diagonal distance is the default distance function
 * for diagonal routing.
 */
export function diagonalDistance(p, q) {
    const dx = Math.abs(p.x - q.x);
    const dy = Math.abs(p.y - q.y);
    return Math.abs(dx - dy) + Math.min(dx, dy) * Math.SQRT2;
}

const defaultOptions = {
    gridStep:  10,
    diagonal:  false,
    bus:       false,
    distance:  manhattanDistance
};

export class Router {
    /*
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
    constructor(options = {}) {
        options = Object.assign({}, defaultOptions, options);
        this.options = Object.assign({
            margin        : 2   * options.gridStep,
            turnCost      : 1.5 * options.gridStep,
            busGain       : 0.5 * options.gridStep,
            crossCost     : 3   * options.gridStep,
            proximityCost : 2   * options.gridStep
        }, options)

        this.limits = rect(0, 0, options.gridStep, options.gridStep);
        this.obstacles = [];
        this.routes = [];
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
        }
        if (r.right > this.limits.right - this.options.margin) {
            this.limits.right = r.right + this.options.margin;
        }
        if (r.top < this.limits.top + this.options.margin) {
            this.limits.top = r.top - this.options.margin;
        }
        if (r.bottom > this.limits.bottom - this.options.margin) {
            this.limits.bottom = r.bottom + this.options.margin;
        }
    }

    /*
     * Re-calculate paths for all routes managed by this router.
     */
    update() {
        this.initGrid();

        // Sort route definitions by increasing distance.
        // This must be done before each re-routing since some routes
        // may have changed in between.
        const dist = this.options.distance;
        this.routes.sort((a, b) => dist(a.start, a.goal) - dist(b.start, b.goal));

        for (const [i, route] of this.routes.entries()) {
            // Add a group Id to connected routes.
            // This must be done on each re-routing since some routes
            // may have changed in between.
            if (!("groupId" in route)) {
                // Use the index of the current route as a group Id
                route.groupId = i;
                // Find all routes connected to this route and assign them the same group Id
                this.propagateGroupId(route, i + 1);
            }

            // Find a path for the current route.
            route.onChange(route, this.findPath(route));
        }
    }

    // Propagate the group Id of the given reference route to
    // all connected routes after the given route index.
    // All routes before startIndex have already received a group Id.
    propagateGroupId(refRoute, startIndex) {
        for (let i = startIndex; i < this.routes.length; i ++) {
            const route = this.routes[i];
            if (!("groupId" in route) &&
                (samePoint(route.start, refRoute.start) ||
                 samePoint(route.start, refRoute.goal)  ||
                 samePoint(route.goal,  refRoute.start) ||
                 samePoint(route.goal,  refRoute.goal))) {
                route.groupId = refRoute.groupId;
                this.propagateGroupId(route, i + 1);
            }
        }
    }

    /*
     * Initialize the grid before re-calculating the paths for all routes.
     * The grid is reallocated if the dimensions of the exploration area have
     * changed recently.
     */
    initGrid() {
        const columns = Math.floor((this.limits.right - this.limits.left) / this.options.gridStep) + 1;
        const rows    = Math.floor((this.limits.bottom - this.limits.top) / this.options.gridStep) + 1;

        const grow = !this.grid || columns > this.grid.length || rows > this.grid[0].length;

        if (grow) {
            this.grid = new Array(columns);
        }

        for (let col = 0, x = this.limits.left; col < columns; col ++, x += this.options.gridStep) {
            if (grow) {
                this.grid[col] = new Array(rows);
            }

            for (let row = 0, y = this.limits.top; row < rows; row ++, y += this.options.gridStep) {
                // If the current grid node is inside an obstacle,
                // set the "obstacle" property of the node.
                const obstacle = this.obstacles.some(
                    r => x >= r.left && x <= r.right &&
                         y >= r.top  && y <= r.bottom
                );

                this.grid[col][row] = {
                    col, row,           // The coordinates of this node in the grid array
                    x, y,               // The coordinates of this node in the exploration area
                    obstacle,           // Is there an obstacle at this node?

                    // The following properties are updated by the pathfinding algorithm

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
        route.start.node.open = true;

        const openSet = new BinaryHeap(node => node.f);
        openSet.push(route.start.node);

        let currentNode;
        while (openSet.size) {
            // Move node with lowest f score from open set to closed set.
            currentNode = openSet.pop();

            // The exploration stops when reaching the goal node
            if (currentNode === route.goal.node) {
                break;
            }

            // Mark the current node as already processed
            currentNode.closed = true;

            // Explore the neighbors of the current node.
            for (const n of this.getNeighbors(currentNode)) {
                // Compute the g score of n with respect to the current node
                let g = currentNode.g + this.options.distance(currentNode, n);

                // Increase the g score if the neighbor makes a turn in the path
                if (currentNode.parent &&
                    (currentNode.x - currentNode.parent.x) * (n.y - currentNode.y) !==
                    (currentNode.y - currentNode.parent.y) * (n.x - currentNode.x)) {
                    g += this.options.turnCost;
                }

                // Increase the g score if the neighbor is part of an obstacle
                if (n.obstacle) {
                    g += this.obstacleCost;
                }

                // Increase the g score if the neighbor has neighbors in other groups
                // or if the neighbor is near an obstacle
                for (const m of this.getNeighbors(n)) {
                    if (!this.options.bus || !m.groups[route.groupId]) {
                        g += this.options.proximityCost * m.groupCount;
                    }
                    if (m.obstacle) {
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

                // If n has not been visited or if its g score has improved...
                if (!n.visited || g < n.g) {
                    // Add n to the tree of candidate routes.
                    n.parent = currentNode;

                    // Set or update the g and f scores of n.
                    n.g = g;
                    n.f = g + this.options.distance(n, route.goal.node);

                    if (n.visited) {
                        openSet.rescore(n);
                    }
                    else {
                        openSet.push(n);
                        n.visited = true;
                    }
                }
            }
        }

        // Update the grid and fill the output string with an SVG path definition
        const path = [];

        while (currentNode) {
            // Mark the current node as used by the routed signal.
            if (!currentNode.groups[route.groupId]) {
                currentNode.groupCount ++;
                currentNode.groups[route.groupId] = true;
            }

            // Add one step the path.
            path.unshift({x: currentNode.x, y: currentNode.y});

            currentNode = currentNode.parent;
        }

        // Remove useless points.
        for (let i = 1; i < path.length - 1;) {
            if ((path[i].x - path[i - 1].x) * (path[i + 1].y - path[i].y) ===
                (path[i].y - path[i - 1].y) * (path[i + 1].x - path[i].x)) {
                path.splice(i, 1);
            }
            else {
                i ++;
            }
        }

        // Align start and end segments to start and goal coordinates.
        const l = path.length - 1;
        if (l > 0) {
            if (path[1].x === path[0].x) {
                path[1].x = route.start.x;
            }
            else if (path[1].y === path[0].y) {
                path[1].y = route.start.y;
            }

            if (path[l - 1].x === path[l].x) {
                path[l - 1].x = route.goal.x;
            }
            else if (path[l - 1].y === path[l].y) {
                path[l - 1].y = route.goal.y;
            }
        }

        path[0].x = route.start.x;
        path[0].y = route.start.y;
        path[l].x = route.goal.x;
        path[l].y = route.goal.y;

        return path;
    }

    /*
     * Get the neighbors of the given node than are acceptable
     * for routing, depending on the current coordinates and the
     * routing style (orthogonal or diagonal).
     */
    getNeighbors(node) {
        const left   = Math.max(node.col - 1, 0);
        const top    = Math.max(node.row - 1, 0);
        const right  = Math.min(node.col + 1, this.grid.length - 1);
        const bottom = Math.min(node.row + 1, this.grid[0].length - 1);

        const neighbors = [];

        for (let c = left; c <= right; c ++) {
            for (let r = top; r <= bottom; r ++) {
                // Skip the current node
                // Skip corners if diagonal routing is disabled
                if (c === node.col && r === node.row ||
                    c !== node.col && r !== node.row && !this.options.diagonal) {
                    continue;
                }

                const n = this.grid[c][r];

                if (!n.closed) {
                    neighbors.push(n);
                }
            }
        }

        return neighbors;
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
export class BinaryHeap {
    constructor(score){
        this.content = [];
        this.score = score;
    }

    get size() {
        return this.content.length;
    }

    push(elt) {
        // Add the new element to the end of the array.
        this.content.push(elt);
        // Allow it to sink down.
        this.sinkDown(this.content.length - 1);
    }

    pop() {
        // Store the first element so we can return it later.
        const res = this.content[0];
        // Get the element at the end of the array.
        const end = this.content.pop();
        // If there are any elements left, put the end element at the
        // start, and let it bubble up.
        if (this.content.length > 0) {
            this.content[0] = end;
            this.bubbleUp(0);
        }
        return res;
    }

    remove(elt) {
        const i = this.content.indexOf(elt);
        // When it is found, the process seen in 'pop' is repeated
        // to fill up the hole.
        const end = this.content.pop();
        if (i !== this.content.length - 1) {
            this.content[i] = end;
            if (this.score(end) < this.score(elt)) {
                this.sinkDown(i);
            }
            else {
                this.bubbleUp(i);
            }
        }
    }

    rescore(elt) {
        this.sinkDown(this.content.indexOf(elt));
    }

    sinkDown(n) {
        // Fetch the element that has to be sunk.
        const elt = this.content[n];
        // When at 0, an element can not sink any further.
        while (n > 0) {
            // Compute the parent element's index, and fetch it.
            const parentN = ((n + 1) >> 1) - 1;
            const parent = this.content[parentN];

            // Found a parent that has lower score? No need to sink any further.
            if (this.score(parent) <= this.score(elt)) {
                break;
            }

            // Swap the elements if the parent has a higher score.
            this.content[parentN] = elt;
            this.content[n]       = parent;

            // Update n to continue at the new position.
            n = parentN;
        }
    }

    bubbleUp(n) {
        // Look up the target element and its score.
        const elt = this.content[n];
        const eltScore = this.score(elt);

        while(true) {
            // Compute the indices of the child elements.
            const child2N = (n + 1) << 1;
            const child1N = child2N - 1;

            // This is used to store the new position of the element, if any.
            let swapN = -1;
            let child1Score;

            // If the first child exists (is inside the array)...
            if (child1N < this.content.length) {
                // Look it up and compute its score.
                const child1 = this.content[child1N];
                child1Score = this.score(child1);
                // If the score is less than our element's, we need to swap.
                if (child1Score < eltScore){
                    swapN = child1N;
                }
            }

            // Do the same checks for the other child.
            if (child2N < this.content.length) {
                const child2 = this.content[child2N],
                child2Score = this.score(child2);
                if (child2Score < (swapN < 0 ? eltScore : child1Score)) {
                    swapN = child2N;
                }
            }

            if (swapN < 0) {
                break;
            }

            // If the element needs to be moved, swap it, and continue.
            this.content[n]     = this.content[swapN];
            this.content[swapN] = elt;

            // Update n to continue at the new position.
            n = swapN;
        }
    }
}
