
import * as Autobus from "../lib/Autobus.js";

window.addEventListener("load", function () {

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

    const componentList = [
        io(0, 25),
        io(0, 115),
        quad(280, 10),
        quad(280, 100),
        quad(50, 190),
        quad(510, 190)
    ];

    const connectorList = [
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

    const groupColorList = [
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

    componentList.map(function (component) {
        router.addObstacle(component.rect);

        const svgRect = document.createElementNS(svgNs, "rect");
        svgRect.setAttribute("x", component.rect.left);
        svgRect.setAttribute("y", component.rect.top);
        svgRect.setAttribute("width",  component.rect.right  - component.rect.left);
        svgRect.setAttribute("height", component.rect.bottom - component.rect.top);
        svg.appendChild(svgRect);

        svgRect.addEventListener("mousedown", function (evt) {
            if (evt.button === 0) {
                installDragAndDropHandlers(svgRect, component, evt.clientX, evt.clientY);
                evt.stopPropagation();
                evt.preventDefault();
            }
        });
    });

    function installDragAndDropHandlers(svgRect, component, dragX, dragY) {
        function moveComponent(dx, dy) {
            component.rect.left   += dx;
            component.rect.right  += dx;
            component.rect.top    += dy;
            component.rect.bottom += dy;

            svgRect.setAttribute("x", component.rect.left);
            svgRect.setAttribute("y", component.rect.top);

            router.extendLimits(component.rect);
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
                    let dx = component.rect.left % options.gridStep;
                    if (dx > options.gridStep / 2) {
                        dx -= options.gridStep;
                    }
                    let dy = component.rect.top  % options.gridStep;
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

    connectorList.forEach(function (connector) {
        const svgPoly = document.createElementNS(svgNs, "polyline");
        svg.appendChild(svgPoly);

        const startComponent = componentList[connector[0]];
        const goalComponent  = componentList[connector[2]];
        const startPort      = startComponent.ports[connector[1]];
        const goalPort       = goalComponent.ports[connector[3]];
        router.addRoute(
            {
                get x() { return startComponent.rect.left + startPort.dx; },
                get y() { return startComponent.rect.top  + startPort.dy; }
            },
            {
                get x() { return goalComponent.rect.left + goalPort.dx; },
                get y() { return goalComponent.rect.top  + goalPort.dy; }
            },
            function (route, pathData) {
                const svgPolyPoints = "";
                pathData.forEach(function (point) {
                    svgPolyPoints += point.x + "," + point.y + " ";
                });
                svgPoly.setAttribute("points", svgPolyPoints);
                svgPoly.setAttribute("stroke", groupColorList[route.groupId % groupColorList.length]);
            }
        );
    });

    const pointList = Array.prototype.concat.apply([],
        componentList.map(function (component) {
            return component.ports.map(function (port) {
                const svgCircle = document.createElementNS(svgNs, "circle");
                svgCircle.setAttribute("r", 3);
                svg.appendChild(svgCircle);

                return {
                    get x() { return component.rect.left + port.dx; },
                    get y() { return component.rect.top  + port.dy; },
                    onChange: function () {
                        svgCircle.setAttribute("cx", this.x);
                        svgCircle.setAttribute("cy", this.y);
                    }
                };
            });
        })
    );

    /*
     * Form handlers
     */

    document.querySelector("#distance").addEventListener("change", function () {
        router.options.distance = Autobus[this.value];
        router.route();
    }, false);

    document.querySelector("#style").addEventListener("change", function () {
        router.options.diagonal = this.value === "diagonal";
        router.route();
    }, false);

    document.querySelector("#bus").addEventListener("change", function () {
        router.options.bus = this.checked;
        router.route();
    }, false);

    document.querySelector("#snap").addEventListener("change", function () {
        router.options.snap = this.checked;
    }, false);


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

        pointList.forEach(function (point) {
            point.onChange();
        });
    }

    /*
     * Initial placement and routing.
     */

    resize();
    refreshRoutes();

});
