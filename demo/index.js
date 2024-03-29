
import * as Autobus from "../lib/Autobus.js";

// Make an input port.
function input(x, y) {
    return {
        rect: Autobus.rect(x, y, x + 10, y + 10),
        ports: [{dx: 10, dy: 5}]
    };
}

// Make an output port.
function output(x, y) {
    return {
        rect: Autobus.rect(x, y, x + 10, y + 10),
        ports: [{dx: 0, dy: 5}]
    };
}

// Make a component with four ports.
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

// Populate the initial model.
const model = {
    components: {
        i1: input(10, 25),
        i2: input(10, 115),
        q1: quad(280, 10),
        q2: quad(280, 100),
        q3: quad(50, 240),
        q4: quad(510, 190),
        o1: output(590, 255),
        o2: output(590, 205)
    },
    wires: [
        ["i1", 0, "q1", 0],
        ["i1", 0, "q3", 0],
        ["i2", 0, "q2", 0],
        ["i2", 0, "q4", 0],
        ["q1", 3, "q2", 2],
        ["q2", 3, "q3", 2],
        ["q2", 3, "q4", 2],
        ["q3", 1, "o1", 0],
        ["q4", 1, "o2", 0]
    ]
};

// Define the color palette for wires.
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

// Create the router.
const options = {
    gridStep: 5,
    continuous: false,
    snap: true
};

const router = new Autobus.Router(options);

for (const c of Object.values(model.components)) {
    router.addObstacle(c.rect);
}

const svgNS = "http://www.w3.org/2000/svg";

let dragState;

class ComponentView {
    constructor(svg, c) {
        this.component = c;

        const g = document.createElementNS(svgNS, "g");
        svg.appendChild(g);
        g.addEventListener("mousedown", evt => {
            if (evt.button === 0) {
                dragState = {
                    view: this,
                    x: evt.clientX,
                    y: evt.clientY
                };
                evt.stopPropagation();
                evt.preventDefault();
            }
        });

        this.outline = document.createElementNS(svgNS, "rect");
        this.outline.setAttribute("x", c.rect.left);
        this.outline.setAttribute("y", c.rect.top);
        this.outline.setAttribute("width",  c.rect.right  - c.rect.left);
        this.outline.setAttribute("height", c.rect.bottom - c.rect.top);
        g.appendChild(this.outline);

        this.io = c.ports.map(p => {
            const circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("r", 3);
            circle.setAttribute("cx", c.rect.left + p.dx);
            circle.setAttribute("cy", c.rect.top  + p.dy);
            g.appendChild(circle);
            return circle;
        });
    }

    move(dx, dy) {
        const r = this.component.rect;
        r.left   += dx;
        r.right  += dx;
        r.top    += dy;
        r.bottom += dy;

        this.outline.setAttribute("x", r.left);
        this.outline.setAttribute("y", r.top);

        for (const [i, p] of this.component.ports.entries()) {
            const circle = this.io[i];
            circle.setAttribute("cx", r.left + p.dx);
            circle.setAttribute("cy", r.top  + p.dy);
        }

        router.extendLimits(r);
        resize();
    }

    snapToGrid() {
        let dx = this.component.rect.left % options.gridStep;
        if (dx > options.gridStep / 2) {
            dx -= options.gridStep;
        }
        let dy = this.component.rect.top  % options.gridStep;
        if (dy > options.gridStep / 2) {
            dy -= options.gridStep;
        }

        this.move(-dx, -dy);
    }
}

function populateView() {
    const svg = document.querySelector("svg");

    for (const w of model.wires) {
        const poly = document.createElementNS(svgNS, "polyline");
        svg.appendChild(poly);

        const ca = model.components[w[0]];
        const cb = model.components[w[2]];
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
                poly.setAttribute("points", path.reduce((acc, {x, y}) => acc + `${x},${y} `, ""));
                poly.setAttribute("stroke", wireColors[route.groupId % wireColors.length]);
            }
        );
    }

    for (const c of Object.values(model.components)) {
        new ComponentView(svg, c);
    }
}

function onMouseMove(evt) {
    if (!dragState) {
        return;
    }

    dragState.view.move(evt.clientX - dragState.x, evt.clientY - dragState.y);
    dragState.x = evt.clientX;
    dragState.y = evt.clientY;

    if (options.continuous) {
        router.update();
    }

    evt.stopPropagation();
    evt.preventDefault();
}

function onMouseUp(evt) {
    if (!dragState || evt.button !== 0) {
        return;
    }

    if (options.snap) {
        dragState.view.snapToGrid();
    }

    router.update();

    dragState = null;

    evt.stopPropagation();
    evt.preventDefault();
}

function resize() {
    const width = router.limits.right - router.limits.left;
    const height = router.limits.bottom - router.limits.top;

    const svg = document.querySelector("svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", router.limits.left + " " + router.limits.top + " " + width + " " + height);
}

window.addEventListener("load", () => {
    populateView();

    document.documentElement.addEventListener("mousemove", onMouseMove);
    document.documentElement.addEventListener("mouseup",   onMouseUp);

    const distance   = document.querySelector("#distance");
    const style      = document.querySelector("#style");
    const bus        = document.querySelector("#bus");
    const snap       = document.querySelector("#snap");
    const continuous = document.querySelector("#continuous");

    function updateOptions(reroute) {
        router.options.distance = Autobus[distance.value];
        router.options.diagonal = style.value === "diagonal";
        router.options.bus      = bus.checked;
        options.snap            = snap.checked;
        options.continuous      = continuous.checked;
        if (reroute) {
            router.update();
        }
    }

    distance.addEventListener("change",   () => updateOptions(true));
    style.addEventListener("change",      () => updateOptions(true));
    bus.addEventListener("change",        () => updateOptions(true));
    snap.addEventListener("change",       () => updateOptions(false));
    continuous.addEventListener("change", () => updateOptions(false));

    updateOptions();
    resize();
    router.update();
});
