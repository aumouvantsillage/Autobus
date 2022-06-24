
import * as Autobus from "../lib/Autobus.js";

window.addEventListener("load", () => {

    function io(x, y) {
        return {
            rect: Autobus.rect(x, y, x + 10, y + 10),
            ports: [{dx: 5, dy: 5}]
        };
    }

    function quad(x, y) {
        return {
            rect: Autobus.rect(x, y, x + 40, y + 40),
            ports: [
                {dx:  0, dy: 20},
                {dx: 40, dy: 20},
                {dx: 20, dy: 0},
                {dx: 20, dy: 40}
            ]
        };
    }

    const components = [
        io(0, 25),
        io(0, 115),
        quad(280, 10),
        quad(280, 100),
        quad(50, 190),
        quad(510, 190)
    ];

    const wires = [
        [0, 0, 2, 0],
        [0, 0, 4, 0],
        [1, 0, 3, 0],
        [1, 0, 5, 0],
        [2, 3, 3, 2],
        [3, 3, 4, 2],
        [3, 3, 5, 2]
    ];

    /*
     * Assign colors to each group.
     */

    const wireColors = [
        "#a84300", // Light brown
        "#008ae6", // Light blue
        "#a89700", // Golden
        "#11a800", // Green
        "#a80011", // Rust
        "#006688", // Dark cyan
        "#ff7722", // Orange
        "#4300a8", // Violet
        "#ff0000", // Red
        "#0011a8", // Dark blue
        "#9700a8", // Purple
        "#808080", // Gray
        "#ff00ff"  // Magenta
    ];

    /*
     * Extract routing data from the circuit definition.
     */

    const options = {
        gridStep: 5,
        continuous: false,
        snap: true
    };

    const router = new Autobus.Router(options);

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.querySelector("svg");

    for (const c of components) {
        router.addObstacle(c.rect);

        const svgRect = document.createElementNS(svgNs, "rect");
        svgRect.setAttribute("x", c.rect.left);
        svgRect.setAttribute("y", c.rect.top);
        svgRect.setAttribute("width",  c.rect.right  - c.rect.left);
        svgRect.setAttribute("height", c.rect.bottom - c.rect.top);
        svg.appendChild(svgRect);

        svgRect.addEventListener("mousedown", evt => {
            if (evt.button === 0) {
                installDragAndDropHandlers(svgRect, c, evt.clientX, evt.clientY);
                evt.stopPropagation();
                evt.preventDefault();
            }
        });
    }

    function installDragAndDropHandlers(svgRect, c, dragX, dragY) {
        function moveComponent(dx, dy) {
            c.rect.left   += dx;
            c.rect.right  += dx;
            c.rect.top    += dy;
            c.rect.bottom += dy;

            svgRect.setAttribute("x", c.rect.left);
            svgRect.setAttribute("y", c.rect.top);

            router.extendLimits(c.rect);
            resize();
        }

        function onMouseMove(evt) {
            moveComponent(evt.clientX - dragX, evt.clientY - dragY);
            if (options.continuous) {
                refreshRoutes();
            }

            dragX = evt.clientX;
            dragY = evt.clientY;

            evt.stopPropagation();
            evt.preventDefault();
        }

        function onMouseUp(evt) {
            if (evt.button === 0) {
                if (options.snap) {
                    let dx = c.rect.left % options.gridStep;
                    if (dx > options.gridStep / 2) {
                        dx -= options.gridStep;
                    }
                    let dy = c.rect.top  % options.gridStep;
                    if (dy > options.gridStep / 2) {
                        dy -= options.gridStep;
                    }

                    moveComponent(-dx, -dy);
                }

                refreshRoutes();

                svg.removeEventListener("mousemove", onMouseMove, false);
                svg.removeEventListener("mouseup", onMouseUp, false);

                evt.stopPropagation();
                evt.preventDefault();
            }
        }

        svg.addEventListener("mousemove", onMouseMove, false);
        svg.addEventListener("mouseup", onMouseUp, false);
    }

    for (const w of wires) {
        const svgPoly = document.createElementNS(svgNs, "polyline");
        svg.appendChild(svgPoly);

        const ca = components[w[0]];
        const cb = components[w[2]];
        const pa = ca.ports[w[1]];
        const pb = cb.ports[w[3]];

        router.addRoute(
            {
                get x() { return ca.rect.left + pa.dx; },
                get y() { return ca.rect.top  + pa.dy; }
            },
            {
                get x() { return cb.rect.left + pb.dx; },
                get y() { return cb.rect.top  + pb.dy; }
            },
            (route, path) => {
                const svgPolyPoints = path.reduce((acc, {x, y}) => acc + `${x},${y} `, "");
                svgPoly.setAttribute("points", svgPolyPoints);
                svgPoly.setAttribute("stroke", wireColors[route.groupId % wireColors.length]);
            }
        );
    }

    const points = components.map(
        c => c.ports.map(
            p => {
                const svgCircle = document.createElementNS(svgNs, "circle");
                svgCircle.setAttribute("r", 3);
                svg.appendChild(svgCircle);

                return {
                    get x() { return c.rect.left + p.dx; },
                    get y() { return c.rect.top  + p.dy; },
                    onChange() {
                        svgCircle.setAttribute("cx", this.x);
                        svgCircle.setAttribute("cy", this.y);
                    }
                };
            }
        )
    ).flat();

    /*
     * Form handlers
     */

    document.querySelector("#distance").addEventListener("change", evt => {
        router.options.distance = Autobus[evt.target.value];
        router.route();
    });

    document.querySelector("#style").addEventListener("change", evt => {
        router.options.diagonal = evt.target.value === "diagonal";
        router.route();
    });

    document.querySelector("#bus").addEventListener("change", evt => {
        router.options.bus = evt.target.checked;
        router.route();
    });

    document.querySelector("#snap").addEventListener("change", evt => {
        router.options.snap = evt.target.checked;
    });


    /*
     * The refresh functions.
     */

    function resize() {
        const width = router.limits.right - router.limits.left;
        const height = router.limits.bottom - router.limits.top;

        svg.setAttribute("width", width);
        svg.setAttribute("height", height);
        svg.setAttribute("viewBox", router.limits.left + " " + router.limits.top + " " + width + " " + height);
    }

    function refreshRoutes() {
        router.route();

        for (const p of points) {
            p.onChange();
        }
    }

    /*
     * Initial placement and routing.
     */

    resize();
    refreshRoutes();

});
