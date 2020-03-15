var Extension;
if (imports.misc.extensionUtils.extensions) {
    Extension = imports.misc.extensionUtils.extensions["paperwm@hedning:matrix.org"];
} else {
    Extension = imports.ui.main.extensionManager.lookup("paperwm@hedning:matrix.org");
}

var Clutter = imports.gi.Clutter
var St = imports.gi.St

var Tiling = Extension.imports.tiling
let fitProportionally = Tiling.fitProportionally

let prefs = {
    window_gap: 5,
    minimum_margin: 3,
}

function repl() {
    virtStage.destroy()
    let stageStyle = `background-color: white;`
    let virtStage = new St.Widget({
        style: stageStyle, height: 80, width: 800
    })

    let canvasStyle = `background-color: yellow;`
    canvasStyle = ""
    let canvas = new St.Widget({name: "canvas", style: canvasStyle, x: 5, y: 5})
    let monitorStyle = `background-color: blue;`
    let monitor = new St.Widget({
        name: "monitor0", 
        style: monitorStyle,
        x: virtStage.width/2 - 300/2, y: 0, width: 300, height: virtStage.height - 10
    })

    let panel = new St.Widget({
        name: "panel",
        style: `background-color: gray`,
        x: 0, y: 0,
        width: monitor.width,
        height: 10

    })
    let workArea = {
        x: monitor.x,
        y: monitor.y + panel.height,
        width: monitor.width,
        height: monitor.height - panel.height,
    }

    let tilingContainer = new St.Widget()


    global.stage.add_actor(virtStage)
    virtStage.add_actor(canvas)
    canvas.add_actor(monitor)
    monitor.add_actor(panel)

    canvas.add_actor(tilingContainer)
    virtStage.x = 1000

    renderAndView(
        tilingContainer,
        layout(
            fromSpace(space),
            workArea,
            prefs
        )
    )

    let columns = layout(
        fromSpace(space),
        workArea,
        prefs
    )
    monitor.x
    columns[1][0].x
    movecolumntoviewportposition(tilingContainer, monitor, columns[1][0], 30)

    virtStage.hide()
    virtStage.show()
}

/** tiling position given:
    m_s: monitor position
    w_m: window position (relative to monitor)
    w_t: window position (relative to tiling)
 */
function t_s(m_s, w_m, w_t) {
    return w_m - w_t + m_s
}

/**
   Calculates the tiling position such that column `k` is positioned at `x`
   relative to the viewport (or workArea?)
 */
function movecolumntoviewportposition(tilingActor, viewport, window, x) {
    tilingActor.x = t_s(viewport.x, x, window.x)
}

function renderAndView(container, columns) {
    let tiling = render(columns)
    if (container.first_child)
        container.first_child.destroy()

    container.add_actor(tiling)
}

function fromSpace(space) {
    return space.map(
        col => col.map(
            metaWindow => {
                let f = metaWindow.get_frame_rect()
                return {
                    width: f.width / 10,
                    height: f.height / 10,
                }
            }
        )
    )
}

/** Render a dummy view of the windows */
function render(columns) {
    let windowStyle = `border: black solid 1px; background-color: red`
    let tilingStyle = `background-color: yellow`
    tilingStyle = ""
    let tiling = new St.Widget({name: "tiling", style: tilingStyle})

    function createWindowActor(window) {
        return new St.Widget({
            style: windowStyle,
            width: window.width,
            height: window.height,
            x: window.x,
            y: window.y
        })
    }

    for (let col of columns) {
        for (let window of col) {
            let windowActor = createWindowActor(window)
            tiling.add_actor(windowActor)
        }
    }
    return tiling
}

function allocateDefault(column, availableHeight, preAllocatedWindow) {
    if (column.length === 1) {
        return [availableHeight];
    } else {
        // Distribute available height amongst non-selected windows in proportion to their existing height
        const gap = prefs.window_gap;
        const minHeight = 15;

        function heightOf(window) {
            return window.height
        }

        const k = preAllocatedWindow && column.indexOf(preAllocatedWindow);
        const selectedHeight = preAllocatedWindow && heightOf(preAllocatedWindow);

        let nonSelected = column.slice();
        if (preAllocatedWindow) nonSelected.splice(k, 1)

        const nonSelectedHeights = nonSelected.map(heightOf);
        let availableForNonSelected = Math.max(
            0,
            availableHeight
                - (column.length-1) * gap
                - (preAllocatedWindow ? selectedHeight : 0)
        );

        const deficit = Math.max(
            0, nonSelected.length * minHeight - availableForNonSelected);

        let heights = fitProportionally(
            nonSelectedHeights,
            availableForNonSelected + deficit
        );

        if (preAllocatedWindow)
            heights.splice(k, 0, selectedHeight - deficit);

        return heights
    }
}

function allocateEqualHeight(column, available) {
    available = available - (column.length-1)*prefs.window_gap;
    return column.map(_ => Math.floor(available / column.length));
}

function layoutGrabColumn(column, x, y0, targetWidth, availableHeight, grabWindow) {
    let needRelayout = false;

    function mosh(windows, height, y0) {
        let targetHeights = fitProportionally(
            windows.map(mw => mw.rect.height),
            height
        );
        let [w, y] = layoutColumnSimple(windows, x, y0, targetWidth, targetHeights);
        return y;
    }

    const k = column.indexOf(grabWindow);
    if (k < 0) {
        throw new Error("Anchor doesn't exist in column " + grabWindow.title);
    }

    const gap = prefs.window_gap;
    const f = grabWindow.globalRect();
    let yGrabRel = f.y - this.monitor.y;
    targetWidth = f.width;

    const H1 = (yGrabRel - y0) - gap - (k-1)*gap;
    const H2 = availableHeight - (yGrabRel + f.height - y0) - gap - (column.length-k-2)*gap;
    k > 0 && mosh(column.slice(0, k), H1, y0);
    let y = mosh(column.slice(k, k+1), f.height, yGrabRel);
    k+1 < column.length && mosh(column.slice(k+1), H2, y);

    return targetWidth;
}


function layoutColumnSimple(windows, x, y0, targetWidth, targetHeights, time) {
    let y = y0;

    for (let i = 0; i < windows.length; i++) {
        let virtWindow = windows[i];
        let targetHeight = targetHeights[i];

        virtWindow.x = x
        virtWindow.y = y
        virtWindow.width = targetWidth
        virtWindow.height = targetHeight

        y += targetHeight + prefs.window_gap;
    }
    return targetWidth, y
}


/**
   Mutates columns
 */
function layout(columns, workArea, prefs, options={}) {
    let gap = prefs.window_gap;
    let availableHeight = workArea.height

    let {inGrab, selectedWindow} = options
    let selectedIndex = -1

    if (selectedWindow) {
        selectedIndex = columns.findIndex(col => col.includes(selectedWindow))
    }

    let y0 = workArea.y
    let x = 0

    for (let i = 0; i < columns.length; i++) {
        let column = columns[i];

        let selectedInColumn = i === selectedIndex ? selectedWindow : null;

        let targetWidth;
        if (i === selectedIndex) {
            targetWidth = selectedInColumn.width;
        } else {
            targetWidth = Math.max(...column.map(w => w.width));
        }
        targetWidth = Math.min(targetWidth, workArea.width - 2*prefs.minimum_margin)

        let resultingWidth, relayout;
        if (inGrab && i === selectedIndex) {
            layoutGrabColumn(column, x, y0, targetWidth, availableHeight, selectedInColumn);
        } else {
            let allocator = options.customAllocators && options.customAllocators[i];
            allocator = allocator || allocateDefault;

            let targetHeights = allocator(column, availableHeight, selectedInColumn);
            layoutColumnSimple(column, x, y0, targetWidth, targetHeights);
        }

        x += targetWidth + gap;
    }

    return columns
}
