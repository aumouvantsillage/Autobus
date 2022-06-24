
import * as Autobus from "../lib/Autobus.js";

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
    bus: false,
    diagonal: false,
    distance: Autobus.manhattanDistance,
    continuous: false,
    snap: true
};

const router = new Autobus.Router(options);

let pointList;

function refreshRoutes() {
    router.route();

    for (const point of pointList) {
        point.onChange();
    }
}

const svgNs = "http://www.w3.org/2000/svg";
let svgRoot;

function resize() {
    const width  = router.limits.right  - router.limits.left;
    const height = router.limits.bottom - router.limits.top;

    svgRoot.setAttribute("width",   width);
    svgRoot.setAttribute("height",  height);
    svgRoot.setAttribute("viewBox", router.limits.left + " " + router.limits.top + " " + width + " " + height);
}

function move(dx, dy) {
    dragState.model.rect.left   += dx;
    dragState.model.rect.right  += dx;
    dragState.model.rect.top    += dy;
    dragState.model.rect.bottom += dy;

    dragState.view.setAttribute("x", dragState.model.rect.left);
    dragState.view.setAttribute("y", dragState.model.rect.top);

    router.extendLimits(dragState.model.rect);
    resize();
}

let dragState;

function dragStart(model, view, x, y) {
    dragState = {model, view, x, y};
}

function onMouseMove(evt) {
    if (!dragState) {
        return;
    }

    move(evt.clientX - dragState.x, evt.clientY - dragState.y);
    if (options.continuous) {
        refreshRoutes();
    }

    dragState.x = evt.clientX;
    dragState.y = evt.clientY;

    evt.stopPropagation();
    evt.preventDefault();
}

function onMouseUp(evt) {
    if (evt.button !== 0 || !dragState) {
        return;
    }

    if (options.snap) {
        var dx = dragState.model.rect.left % options.gridStep;
        if (dx > options.gridStep / 2) {
            dx -= options.gridStep;
        }
        var dy = dragState.model.rect.top  % options.gridStep;
        if (dy > options.gridStep / 2) {
            dy -= options.gridStep;
        }

        move(-dx, -dy);
    }

    refreshRoutes();

    evt.stopPropagation();
    evt.preventDefault();

    dragState = null;
}

window.addEventListener("load", () => {
    svgRoot = document.querySelector("svg");

    for (const component of componentList) {
        router.addObstacle(component.rect);

        const svgRect = document.createElementNS(svgNs, "rect");
        svgRect.setAttribute("x", component.rect.left);
        svgRect.setAttribute("y", component.rect.top);
        svgRect.setAttribute("width",  component.rect.right  - component.rect.left);
        svgRect.setAttribute("height", component.rect.bottom - component.rect.top);
        svgRoot.appendChild(svgRect);

        svgRect.addEventListener("mousedown", evt => {
            if (evt.button === 0) {
                dragStart(component, svgRect, evt.clientX, evt.clientY);
                evt.stopPropagation();
                evt.preventDefault();
            }
        });
    }

    document.documentElement.addEventListener("mousemove", onMouseMove, false);
    document.documentElement.addEventListener("mouseup",   onMouseUp,   false);

    for (const connector of connectorList) {
        var svgPoly = document.createElementNS(svgNs, "polyline");
        svgRoot.appendChild(svgPoly);

        var startComponent = componentList[connector[0]];
        var goalComponent  = componentList[connector[2]];
        var startPort      = startComponent.ports[connector[1]];
        var goalPort       = goalComponent.ports[connector[3]];
        router.addRoute(
            {
                get x() { return startComponent.rect.left + startPort.dx; },
                get y() { return startComponent.rect.top  + startPort.dy; }
            },
            {
                get x() { return goalComponent.rect.left + goalPort.dx; },
                get y() { return goalComponent.rect.top  + goalPort.dy; }
            },
            (route, pathData) => {
                var svgPolyPoints = "";
                for (const point of pathData) {
                    svgPolyPoints += point.x + "," + point.y + " ";
                }
                svgPoly.setAttribute("points", svgPolyPoints);
                svgPoly.setAttribute("stroke", groupColorList[route.groupId % groupColorList.length]);
            }
        );
    }

    pointList = componentList.map(
        component => component.ports.map(
            port => {
                const svgCircle = document.createElementNS(svgNs, "circle");
                svgCircle.setAttribute("r", 3);
                svgRoot.appendChild(svgCircle);

                return {
                    get x() { return component.rect.left + port.dx; },
                    get y() { return component.rect.top  + port.dy; },
                    onChange() {
                        svgCircle.setAttribute("cx", this.x);
                        svgCircle.setAttribute("cy", this.y);
                    }
                };
        })
    ).flat();

    /*
     * Form handlers
     */

    document.querySelector("#distance")
        .addEventListener("change", evt => {
            router.options.distance = Autobus[evt.target.value];
            router.route();
        });

    document.querySelector("#style")
        .addEventListener("change", evt => {
            router.options.diagonal = evt.target.value === "diagonal";
            router.route();
        });

    document.querySelector("#bus")
        .addEventListener("change", evt => {
            router.options.bus = evt.target.checked;
            router.route();
        });

    document.querySelector("#snap")
        .addEventListener("change", evt => {
            router.options.snap = evt.target.checked;
        });


    resize();
    refreshRoutes();
});
