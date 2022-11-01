var canvas, context;
var time = 0, timestamp = 0, actualFps, frameRateFactor = .5;

var passengers = [];
var taxis = [];
var vertices = [];
var edges = [];
var minDistMatrix = [];
var minDistEdgeMatrix = [];

// Data
var _names = ['South Gate', 'Main Gate', 'Southeast Gate', 'Cafeteria 2', 'Main buliding', 'Xueyan Building', 'Tianjiabin', 'Library', 'Playground', 'New Cafeteria', 'North Gate', 'Students Dormitory'];
var _vertices = [[25, 3], [225, 3], [500, 3], [3, 125], [225, 100], [600, 60], [25, 250], [350, 250], [3, 350], [550, 450], [220, 600], [440, 550]];
var _edges = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [3, 6], [4, 6], [4, 7], [5, 7], [5, 9], [6, 7], [6, 8], [6, 10], [7, 11], [7, 9], [8, 10], [10, 11], [9, 11]];

// Parameters - feel free to adjust
const frameRate = 30;
const timeScale = 160;          // simulation is faster than real time
const taxiSpeed = 30;           // pixels/min
const walkingSpeed = 4;         // pixels/min
const initialPassengers = 10;   // initial number of passengers
const initialTaxis = 20;        // initial number of taxis
const passengerRate = .5;       // probability of a new passenger in each minute
const trafficChangeRate = .004; // probability of traffic status changing in each minute
const taxiChangeRate = .02;     // probability to add/remove taxi in each minute
const stoppingTime = 1;         // time in minutes it takes for passenger to get on/off
const maxPassengerEdgeDistance = 50;  // passengers must be this distance within edges
const maxPickupRange = 600;     // taxis would not pick up passengers further than this distance

// Graphical parameters
const timeFont = '24px Fira Mono, monospace';
const generalFont = '16px Fira Mono, monospace';
const textColor = '#333';
const edgeWidth = 3;
const edgeColor = ['', '#00800080', '#f0c00080', '#ff000080'];
const taxiWidth = 8, taxiLength = 16;
const taxiColor = { available: '#20a020', preride: '#ffa000', ride: '#a000d0' };
const passengerSize = 8;
const passengerColor = { waiting: '#ff0000', preride: '#ffa000', postride: '#00a0d0' };

function ready() {
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');
    context.transform(1, 0, 0, 1, 50, 50);

    // Initialise map data
    for (let i = 0; i < _vertices.length; i++) {
        vertices.push({
            id: i,
            x: _vertices[i][0],
            y: 600 - _vertices[i][1],
            label: _names[i],
            edges: []
        });
    }

    for (let i = 0; i < _edges.length; i++) {
        let traffic = [1, 1, 1, 1, 2, 2, 3][randomInt(7)];
        let edge = {
            id: i,
            start: vertices[_edges[i][0]],
            end: vertices[_edges[i][1]],
            traffic
        };
        edge.length = Math.sqrt(Math.pow(edge.end.x - edge.start.x, 2) + Math.pow(edge.end.y - edge.start.y, 2));
        edge.dir = {
            x: (edge.end.x - edge.start.x) / edge.length,
            y: (edge.end.y - edge.start.y) / edge.length,
        };
        edge.start.edges.push(edge);
        edge.end.edges.push(edge);
        edges.push(edge);
    }

    updateGraphData();

    // Initial taxis & passengers
    for (let i = 0; i < initialTaxis; i++) newTaxi();
    for (let i = 0; i < initialPassengers; i++) newPassenger();

    draw();

    // Start simulation after 3 seconds
    setTimeout(() => {
        timestamp = Date.now();
        actualFps = frameRate;
        setInterval(() => {
            step(timeScale / frameRate / 60);
        }, 1000 / frameRate - 4); // Estimated rendering time = 4ms

        setTimeout(() => { frameRateFactor = .2; }, 120);
        setTimeout(() => { frameRateFactor = .05; }, 500);
        setTimeout(() => { frameRateFactor = .01; }, 2000);
    }, 3000);
}

// t = time in minutes
function step(t) {
    time += t;

    // Move taxis
    for (let taxi of taxis) {
        if (taxi.freezeUntil > time) continue;

        taxi.pos += taxi.dir * t * taxiSpeed / taxi.edge.length / taxi.edge.traffic;

        // Taxi at destination
        if (taxi.dest && taxi.dest.edge === taxi.edge) {
            let diff = taxi.dest.pos - taxi.pos;
            if (taxi.dir !== 0 && diff * taxi.dir < 0) {
                if (taxi.status === 'preride') {
                    taxi.freezeUntil = time + stoppingTime;

                    if (taxi.passenger.ready)
                        startRide(taxi);
                    else {
                        taxi.dir = 0;
                        taxi.pos = taxi.dest.pos;
                    }
                } else if (taxi.status === 'ride') {
                    endRide(taxi);
                }
            }
        }

        // Taxi at junction
        if ((taxi.pos <= 0 && taxi.dir === -1) || (taxi.pos >= 1 && taxi.dir === 1)) {
            let vertex = taxi.dir === -1 ? taxi.edge.start : taxi.edge.end;
            if (taxi.status === 'available') {
                let newEdge = randomTurn(vertex, taxi.edge);
                taxi.edge = newEdge;
                taxi.dir = newEdge.start.id === vertex.id ? 1 : -1;
                taxi.pos = taxi.dir === 1 ? 0 : 1;
            } else {
                // Taxi has a destination to go
                let direction = getDirection(taxi, taxi.dest);
                taxi.edge = direction.edge;
                taxi.dir = direction.dir;
                taxi.pos = direction.dir === 1 ? 0 : 1;
            }
        }
    }

    // Move passengers
    for (let passenger of passengers) {
        if ((passenger.status === 'preride') && !passenger.ready) {
            let deltaX = passenger.from.near.x - passenger.position.x;
            let deltaY = passenger.from.near.y - passenger.position.y;
            let delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (delta < t * walkingSpeed) {
                passenger.position = passenger.from.near;
                passenger.ready = true;
                if (passenger.status === 'preride' && passenger.taxi.dir === 0) {
                    startRide(passenger.taxi);
                }
            } else {
                passenger.position.x += deltaX / delta * t * walkingSpeed;
                passenger.position.y += deltaY / delta * t * walkingSpeed;
            }
        } else if ((passenger.status === 'postride')) {
            let deltaX = passenger.to.x - passenger.position.x;
            let deltaY = passenger.to.y - passenger.position.y;
            let delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (delta < t * walkingSpeed) {
                passenger.position = passenger.to;
                passenger.status = 'finished';
            } else {
                passenger.position.x += deltaX / delta * t * walkingSpeed;
                passenger.position.y += deltaY / delta * t * walkingSpeed;
            }
        }
    }

    // Change traffic status randomly
    let trafficChanged = false;
    for (let edge of edges) {
        if (edge.traffic > 1 && randomBoolean(trafficChangeRate * t)) { edge.traffic--; trafficChanged = true; }
        if (edge.traffic < 3 && randomBoolean(trafficChangeRate * .5 * t)) { edge.traffic++; trafficChanged = true; }
    }
    if (trafficChanged) updateGraphData();

    // Generate random passengers
    if (randomBoolean(passengerRate * t)) {
        newPassenger();
    }

    // Generate random taxis
    if (randomBoolean(taxiChangeRate * t * Math.max(1, initialTaxis - taxis.length))) {
        newTaxi();
    }

    for (let taxi of taxis) {
        if (randomBoolean(taxiChangeRate * t / initialTaxis)) {
            if (taxi.status === 'available')
                taxis.splice(taxis.indexOf(taxi), 1);
            else
                taxi.toBeRemoved = true;
        }
    }

    // Allocate taxis to waiting passengers
    for (let passenger of passengers) {
        if (passenger.status === 'waiting')
            allocateTaxi(passenger);
    }

    // Compute frame rate
    let now = Date.now();
    actualFps = frameRateFactor * 1000 / (now - timestamp) + (1 - frameRateFactor) * actualFps;
    timestamp = now;

    draw();
}

function draw() {
    // Clear canvas
    context.clearRect(-100, -100, 1400, 1000);

    // Draw passenger-taxi links
    for (let taxi of taxis) {
        if (taxi.status === 'preride') {
            let coord = coordinatesFromEdgePos(taxi.edge, taxi.pos);
            drawDashedLine(coord.x, coord.y, taxi.passenger.position.x, taxi.passenger.position.y, taxiColor['preride'] + '60');
        } else if (taxi.status === 'ride') {
            let coord = coordinatesFromEdgePos(taxi.edge, taxi.pos);
            drawDashedLine(coord.x, coord.y, taxi.dest.x, taxi.dest.y, taxiColor['ride'] + '40');
        }
    }

    // Draw edges
    for (let edge of edges) {
        drawLine(edge.start.x, edge.start.y, edge.end.x, edge.end.y, edgeColor[edge.traffic]);
    }

    // Draw passengers
    for (let passenger of passengers) {
        if (passenger.status === 'waiting' || passenger.status === 'preride' || passenger.status === 'postride') {
            fillCircle(passenger.position.x, passenger.position.y, passengerColor[passenger.status]);
        }

        if (passenger.status === 'postride') {
            // Draw link to destination
            drawDashedLine(passenger.position.x, passenger.position.y, passenger.to.x, passenger.to.y, passengerColor['postride'] + '40');
            fillCircle(passenger.to.x, passenger.to.y, passengerColor['postride'] + '80');
        }
    }

    // Draw taxis
    for (let taxi of taxis) {
        let coord = coordinatesFromEdgePos(taxi.edge, taxi.pos);
        drawWideLine(coord.x - taxiLength * taxi.edge.dir.x / 2, coord.y - taxiLength * taxi.edge.dir.y / 2,
            coord.x + taxiLength * taxi.edge.dir.x / 2, coord.y + taxiLength * taxi.edge.dir.y / 2, taxiColor[taxi.status]);

        if (taxi.status === 'ride') {
            fillCircle(taxi.dest.x, taxi.dest.y, taxiColor['ride'] + '80');
        }
    }

    // Time
    context.font = timeFont;
    context.textAlign = 'left';
    context.fillStyle = textColor;
    context.fillText(timeStr(), 690, 50); 

    // Legends
    context.font = generalFont;
    fillCircle(700, 100, passengerColor['waiting']);
    fillCircle(700, 125, passengerColor['preride']);
    fillCircle(700, 150, passengerColor['postride']);
    fillCircle(700, 175, taxiColor['ride'] + '80');
    drawText(720, 106, 'Passenger waiting for a taxi');
    drawText(720, 131, 'Passenger walking to pick-up point');
    drawText(720, 156, 'Passenger walking to destination after ride');
    drawText(720, 181, 'Destination');

    drawWideLine(700 - taxiLength / 2, 225, 700 + taxiLength / 2, 225, taxiColor['available']);
    drawWideLine(700 - taxiLength / 2, 250, 700 + taxiLength / 2, 250, taxiColor['preride']);
    drawWideLine(700 - taxiLength / 2, 275, 700 + taxiLength / 2, 275, taxiColor['ride']);
    drawText(720, 231, 'Available taxi');
    drawText(720, 256, 'Taxi picking up a passenger');
    drawText(720, 281, 'Taxi carrying a passenger');

    drawLine(690, 325, 710, 325, edgeColor[1]);
    drawLine(690, 350, 710, 350, edgeColor[2]);
    drawLine(690, 375, 710, 375, edgeColor[3]);
    drawText(720, 331, 'Road, low congestion');
    drawText(720, 356, 'Road, moderate congestion');
    drawText(720, 381, 'Road, severe congestion');

    drawText(690, 431, 'Taxis:        ' + (taxis.filter(taxi => taxi.status === 'available').length) + ' available / ' + taxis.length + ' total');
    drawText(690, 456, 'Passengers:   ' + (passengers.filter(p => p.status === 'waiting').length) + ' waiting for taxi');
    drawText(690, 481, '              ' + (passengers.filter(p => p.status === 'preride').length) + ' waiting for pick-up');
    drawText(690, 506, '              ' + (passengers.filter(p => p.status === 'ride').length) + ' on taxi');
    drawText(690, 531, '              ' + (passengers.filter(p => p.status === 'postride').length) + ' walking to destination');
    drawText(690, 556, '              ' + (passengers.filter(p => p.status === 'finished').length) + ' finished');

    drawText(690, 606, 'Frame rate:   ' + (actualFps || 0).toFixed(0) + ' FPS / Target: ' + frameRate.toFixed(0) + ' FPS');
    drawText(690, 631, 'Actual speed: ' + ((actualFps || 0) / frameRate * timeScale).toFixed(0) + ' x');
}

function drawLine(x1, y1, x2, y2, style) {
    context.lineWidth = edgeWidth;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    if (style) context.strokeStyle = style;
    context.stroke();
}

function drawWideLine(x1, y1, x2, y2, style) {
    context.lineWidth = taxiWidth;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    if (style) context.strokeStyle = style;
    context.stroke();
}

function drawDashedLine(x1, y1, x2, y2, style) {
    context.lineWidth = edgeWidth;
    context.setLineDash([10, 10]);
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    if (style) context.strokeStyle = style;
    context.stroke();
    context.setLineDash([]);
}

function fillCircle(x, y, style) {
    context.beginPath();
    context.arc(x, y, passengerSize / 2, 0, 2 * Math.PI);
    if (style) context.fillStyle = style;
    context.fill();
}

function drawText(x, y, text) {
    context.fillStyle = textColor;
    context.fillText(text, x, y); 
}

// Compute minimal distance between vertices
function updateGraphData() {
    let n = vertices.length;

    // Fill matrices with initial values
    minDistMatrix = Array(n).fill().map(() => Array(n).fill(Infinity));
    minDistEdgeMatrix = Array(n).fill().map(() => Array(n).fill());
    
    for (let i = 0; i < n; i++) minDistMatrix[i][i] = 0;

    // In the i-th loop, consider paths with i edges
    for (let i = 0; i < n - 2; i++) {
        for (let edge of edges) {
            for (let dest of vertices) {
                let newDist = edge.length * edge.traffic + minDistMatrix[edge.end.id][dest.id];
                if (newDist < minDistMatrix[edge.start.id][dest.id]) {
                    minDistMatrix[edge.start.id][dest.id] = newDist;
                    minDistEdgeMatrix[edge.start.id][dest.id] = edge;
                }

                newDist = edge.length * edge.traffic + minDistMatrix[edge.start.id][dest.id];
                if (newDist < minDistMatrix[edge.end.id][dest.id]) {
                    minDistMatrix[edge.end.id][dest.id] = newDist;
                    minDistEdgeMatrix[edge.end.id][dest.id] = edge;
                }
            }
        }
    }
}

// from and to can be taxi or point
function getDirection(from, to) {
    if (from.edge.id === to.edge.id) {
        return {
            edge: from.edge,
            dir: to.pos > from.pos ? 1 : -1,
            dist: Math.abs(to.pos - from.pos) * from.edge.length * from.edge.traffic
        };
    }

    let distFromStartToStart = minDistMatrix[from.edge.start.id][to.edge.start.id] +
        from.edge.length * from.edge.traffic * from.pos + to.edge.length * to.edge.traffic * to.pos;
    let distFromStartToEnd = minDistMatrix[from.edge.start.id][to.edge.end.id] +
        from.edge.length * from.edge.traffic * from.pos + to.edge.length * to.edge.traffic * (1 - to.pos);
    let distFromStart = Math.min(distFromStartToStart, distFromStartToEnd);
    let edgeFromStart = minDistEdgeMatrix[from.edge.start.id][distFromStartToStart < distFromStartToEnd ? to.edge.start.id : to.edge.end.id] || to.edge;

    let distFromEndToStart = minDistMatrix[from.edge.end.id][to.edge.start.id] +
        from.edge.length * from.edge.traffic * (1 - from.pos) + to.edge.length * to.edge.traffic * to.pos;
    let distFromEndToEnd = minDistMatrix[from.edge.end.id][to.edge.end.id] +
        from.edge.length * from.edge.traffic * (1 - from.pos) + to.edge.length * to.edge.traffic * (1 - to.pos);
    let distFromEnd = Math.min(distFromEndToStart, distFromEndToEnd);
    let edgeFromEnd = minDistEdgeMatrix[from.edge.end.id][distFromEndToStart < distFromEndToEnd ? to.edge.start.id : to.edge.end.id] || to.edge;

    if (distFromStart < distFromEnd) {
        return from.pos > 0 ? {
            edge: from.edge,
            dir: -1,
            dist: distFromStart
        } : {
            edge: edgeFromStart,
            dir: edgeFromStart.start.id === from.edge.start.id ? 1 : -1,
            dist: distFromStart
        };
    } else {
        return from.pos < 1 ? {
            edge: from.edge,
            dir: 1,
            dist: distFromEnd
        } : {
            edge: edgeFromEnd,
            dir: edgeFromEnd.start.id === from.edge.end.id ? 1 : -1,
            dist: distFromEnd
        };
    } 
}

function randomBoolean(p) {
    return Math.random() < p;
}

function randomInt(n) {
    return Math.floor(Math.random() * n);
}

function timeStr() {
    let hourStr = Math.floor(time / 60).toString();
    while (hourStr.length < 2) hourStr = '0' + hourStr;
    let minStr = Math.floor(time % 60).toString();
    while (minStr.length < 2) minStr = '0' + minStr;
    let secStr = Math.floor((time * 60) % 60).toString();
    while (secStr.length < 2) secStr = '0' + secStr;
    return hourStr + ':' + minStr + ':' + secStr;
}

function newTaxi() {
    taxis.push({
        edge: edges[randomInt(edges.length)],
        pos: Math.random(),
        dir: randomBoolean(.5) ? 1 : -1,
        status: 'available',
        passenger: null
    });
}

// Unoccupied taxi at junction - make a random turn. Returns the new edge.
function randomTurn(vertex, fromEdge) {
    let candidates = [...vertex.edges].filter(edge => edge.id !== fromEdge.id);
    if (candidates.length === 0) return fromEdge;

    // Driver would choose the road with the least traffic
    let leastTraffic = Math.min(...candidates.map(edge => edge.traffic));
    candidates = candidates.filter(edge => edge.traffic === leastTraffic);
    return candidates[randomInt(candidates.length)];
}

function pointEdgeDistance(point, edge) {
    let x = point.x, y = point.y, x1 = edge.start.x, y1 = edge.start.y, x2 = edge.end.x, y2 = edge.end.y;
    let A = Math.sqrt(Math.pow((x - x1), 2) + Math.pow((y - y1), 2));
    let B = Math.sqrt(Math.pow((x - x2), 2) + Math.pow((y - y2), 2));
    let C = Math.sqrt(Math.pow((x1 - x2), 2) + Math.pow((y1 - y2), 2));
    if ((x2 - x1) * (x1 - x) + (y2 - y1) * (y1 - y) > 0) return A;
    if ((x1 - x2) * (x2 - x) + (y1 - y2) * (y2 - y) > 0) return B;
    let P = (A + B + C) / 2;
    let area = Math.sqrt(P * (P - A) * (P - B) * (P - C));
    return 2 * area / C;
}

function nearestPosOnEdge(point, edge) {
    let x = point.x, y = point.y, x1 = edge.start.x, y1 = edge.start.y, x2 = edge.end.x, y2 = edge.end.y;
    if ((x2 - x1) * (x1 - x) + (y2 - y1) * (y1 - y) > 0) return 0;
    if ((x1 - x2) * (x2 - x) + (y1 - y2) * (y2 - y) > 0) return 1;
    return ((x1 - x) * (x1 - x2) + (y1 - y) * (y1 - y2)) / Math.pow(edge.length, 2);
}

function newPointNearEdge() {
    do {
        let point = {
            x: randomInt(600),
            y: randomInt(600)
        }
        let distances = edges.map(edge => pointEdgeDistance(point, edge));
        let distance = Math.min(...distances);
        if (distance > maxPassengerEdgeDistance) continue;

        let edge = edges[distances.indexOf(distance)];
        let pos = nearestPosOnEdge(point, edge);

        point.edge = edge;
        point.pos = pos;
        point.near = coordinatesFromEdgePos(edge, pos);
        return point;
    } while (true);
}

function coordinatesFromEdgePos(edge, pos) {
    let x = edge.start.x * (1 - pos) + edge.end.x * pos;
    let y = edge.start.y * (1 - pos) + edge.end.y * pos;
    return {x, y};
}

function newPassenger() {
    let from = newPointNearEdge();
    let to = newPointNearEdge();

    let passenger = {
        from,
        to,
        position: { x: from.x, y: from.y },
        status: 'waiting'
    };

    passengers.push(passenger);
}

function allocateTaxi(passenger) {
    let candidates = [];
    for (let taxi of taxis) {
        if (taxi.status !== 'available') continue;

        let direction = getDirection(taxi, passenger.from);
        candidates.push({ taxi, direction });
    }

    if (candidates.length === 0) return;

    let minDist = Math.min(...candidates.map(c => c.direction.dist));
    if (minDist > maxPickupRange) return;

    let c = candidates.filter(c => c.direction.dist === minDist)[0];
    c.taxi.status = 'preride';
    c.taxi.passenger = passenger;
    c.taxi.dest = passenger.from;
    c.taxi.edge = c.direction.edge;
    c.taxi.dir = c.direction.dir;

    passenger.status = 'preride';
    passenger.taxi = c.taxi;
}

function startRide(taxi) {
    taxi.dest = taxi.passenger.to;
    let direction = getDirection(taxi, taxi.dest);

    taxi.edge = direction.edge;
    taxi.dir = direction.dir;
    taxi.status = 'ride';

    taxi.passenger.status = 'ride';
}

function endRide(taxi) {
    let passenger = taxi.passenger;
    passenger.status = 'postride';
    passenger.position = coordinatesFromEdgePos(taxi.edge, taxi.pos);
    passenger.ready = false;

    taxi.dest = undefined;
    taxi.status = 'available';
    taxi.passenger = undefined;
    taxi.freezeUntil = time + stoppingTime;

    if (taxi.toBeRemoved) {
        taxis.splice(taxis.indexOf(taxi), 1);
    }
}
