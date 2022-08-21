import { parseColor } from "./cfg-parser.js";

const GRAVITY_CONSTANT = 6.67430e-11;
const EARTH_ACCELERATION = 9.80665;

function choose(...args: any[]){
    for(const arg of args){
        if(arg !== undefined) return arg;
    }
}

export function parseToSunConfig(sunConfig: any, templateBodies: Map<string, ICelestialBody | IOrbitingBody>)
    : ParsedUnorderedSunData {
    const template = templateBodies.get(sunConfig.Template?.name) as ICelestialBody | undefined;

    const name   = sunConfig.name;
    const radius = parseFloat(choose(sunConfig.Properties.radius, template?.radius));
    const soi    = Infinity;
    const color  = 0xffff00;

    const atmosphereAlt = deduceAtmosphereAltitude(sunConfig, template);

    const {stdGravParam, mass} = deduceStdGravParamAndMass(sunConfig, radius, template);

    return {
        name,
        radius,
        atmosphereAlt,
        mass,
        stdGravParam,
        soi,
        color
    };
}

export function parseToBodyConfig(bodyConfig: any, templateBodies: Map<string, ICelestialBody | IOrbitingBody>)
    : ParsedUnorderedOrbitingData {
    const template = templateBodies.get(bodyConfig.Template?.name) as IOrbitingBody | undefined;

    const name   = bodyConfig.name;
    const radius = parseFloat(choose(bodyConfig.Properties.radius, template?.radius));
    const soi    = parseFloat(bodyConfig.Properties.sphereOfInfluence || undefined);
    
    const atmosphereAlt = deduceAtmosphereAltitude(bodyConfig, template);
    
    const {stdGravParam, mass} = deduceStdGravParamAndMass(bodyConfig, radius, template);
    
    const semiMajorAxis     = parseFloat(choose(bodyConfig.Orbit.semiMajorAxis, template?.orbit.semiMajorAxis));
    const eccentricity      = parseFloat(choose(bodyConfig.Orbit.eccentricity, template?.orbit.eccentricity));
    const inclination       = parseFloat(choose(bodyConfig.Orbit.inclination, template?.orbit.inclination));
    const argOfPeriapsis    = parseFloat(choose(bodyConfig.Orbit.argumentOfPeriapsis, template?.orbit.argOfPeriapsis));
    const ascNodeLongitude  = parseFloat(choose(bodyConfig.Orbit.longitudeOfAscendingNode, template?.orbit.ascNodeLongitude));

    const meanAnomaly0 = deduceMeanAnomaly0(bodyConfig, template);

    const epoch = parseFloat(choose(bodyConfig.Orbit.epoch, template?.epoch));

    const color = deduceColorInteger(bodyConfig, template);
    
    const referenceBody = bodyConfig.Orbit.referenceBody;

    return {
        referenceBody,
        data:
        {
            name,
            radius,
            atmosphereAlt,
            mass,
            stdGravParam,
            soi,
            orbit:
            {
                semiMajorAxis,
                eccentricity,
                inclination,
                argOfPeriapsis,
                ascNodeLongitude,
            },
            meanAnomaly0,
            epoch,
            color,
        },
    };
}

export function completeBodytoUnorderedData(body: IOrbitingBody): IOrbitingBody_Unordered {
    return {
        name: body.name,
        radius: body.radius,
        atmosphereAlt: body.atmosphereAlt,
        mass: body.mass,
        stdGravParam: body.stdGravParam,
        soi: body.soi,
        orbit:
        {
            semiMajorAxis: body.orbit.semiMajorAxis,
            eccentricity: body.orbit.eccentricity,
            inclination: body.orbit.inclination,
            argOfPeriapsis: body.orbit.argOfPeriapsis,
            ascNodeLongitude: body.orbit.ascNodeLongitude,
        },
        meanAnomaly0: body.meanAnomaly0,
        epoch: body.epoch,
        color: body.color,
    };
}

function deduceAtmosphereAltitude(config: any, template?: ICelestialBody){
    if(!config.Atmosphere) return;
    return choose(
        config.Atmosphere.atmosphereDepth,
        config.Atmosphere.altitude,
        config.Atmosphere.maxAltitude,
        template?.atmosphereAlt
    );
}

function deduceStdGravParamAndMass(bodyConfig: any, radius: number, template?: ICelestialBody){
    let stdGravParam = 0, mass = 0;

    if(bodyConfig.Properties.gravParameter !== undefined){
        stdGravParam = parseFloat(bodyConfig.Properties.gravParameter);

    } else if(bodyConfig.Properties.geeASL !== undefined){
        const geeASL = parseFloat(bodyConfig.Properties.geeASL);
        stdGravParam = geeASL * radius * radius * EARTH_ACCELERATION;

    } else if(bodyConfig.Properties.mass !== undefined){
        mass = parseFloat(bodyConfig.Properties.mass);
        stdGravParam = mass * GRAVITY_CONSTANT;

    } else {
        stdGravParam = template?.stdGravParam as number;
    }
    return {stdGravParam, mass: mass != 0 ? mass : stdGravParam / GRAVITY_CONSTANT};
}

function deduceColorInteger(bodyConfig: any, template?: ICelestialBody){
    if(bodyConfig.Orbit.color !== undefined){
        return parseColor(bodyConfig.Orbit.color);
    } else if(template?.color) {
        return template.color;
    } else { return 0xffffff; }
}

function deduceMeanAnomaly0(bodyConfig: any, template?: IOrbitingBody){

    if(bodyConfig.Orbit.meanAnomalyAtEpoch !== undefined){
        return parseFloat(bodyConfig.Orbit.meanAnomalyAtEpoch);

    } else if(bodyConfig.Orbit.meanAnomalyAtEpochD !== undefined) {
        const meanAnomaly0D = parseFloat(bodyConfig.Orbit.meanAnomalyAtEpochD);
        return meanAnomaly0D * Math.PI / 180;

    } else {
        return template?.meanAnomaly0 as number;
    }
}

export function recomputeSOIs(orbiting: IOrbitingBody[], sun: ICelestialBody){
    const attractor = (body: IOrbitingBody) => body.orbiting == 0 ? sun : orbiting[body.orbiting-1];
     for(const body of orbiting){
        if(isNaN(body.soi)){
            //@ts-ignore
            body.soi = body.orbit.semiMajorAxis * Math.pow(body.mass/attractor(body).mass, 2/5);
        }
    }
}

export function orderOrbitingBodies(orbitingUnordered: ParsedUnorderedOrbitingData[], sunName: string) {
    const nameToInfo = new Map<string, ParsedUnorderedOrbitingData>();
    for(const info of orbitingUnordered){
        nameToInfo.set(info.data.name, info);
    }

    const systemTree = buildSystemTree(orbitingUnordered, sunName);
    for(const [, children] of systemTree){
        children.sort((nameA, nameB) => {
            //@ts-ignore
            const orbitA = nameToInfo.get(nameA).data.orbit;
            //@ts-ignore
            const orbitB = nameToInfo.get(nameB).data.orbit;

            return orbitB.semiMajorAxis - orbitA.semiMajorAxis;
        });
    }

    const orderedNames = DFS(systemTree, sunName);
    
    const ids = new Map<string, number>();
    for(let i = 0; i < orderedNames.length; i++){
        ids.set(orderedNames[i], i);
    }

    const orbitingOrdered: IOrbitingBody[] = [];
    for(let i = 1; i < orderedNames.length; i++){
        //@ts-ignore
        const {referenceBody, data} = nameToInfo.get(orderedNames[i]);
        const orbiting = ids.get(referenceBody);
        orbitingOrdered.push({id: i, orbiting, ...data});
    }

    return orbitingOrdered;
}

function buildSystemTree(orbitingUnordered: ParsedUnorderedOrbitingData[], sunName: string) {
    const systemTree = new Map<string, string[]>([[sunName, []]]);
    for(const {data} of orbitingUnordered){
        systemTree.set(data.name, []);
    }

    for(const {data, referenceBody} of orbitingUnordered){
        const children = systemTree.get(referenceBody);
        if(children === undefined){
            throw new Error(`Missing body ${referenceBody}`);
        }
        children.push(data.name);
    }

    return systemTree;
}

function DFS<T>(adj: Map<T, T[]>, start: T){
    const visited = new Set();
    const stack: T[] = [start];
    const result: T[] = [];
    
    while(stack.length > 0){
        const node = stack.pop() as T;
        result.push(node);
        visited.add(node);

        for(const child of (adj.get(node) as T[])){
            if(!visited.has(child)){
                stack.push(child);
            }
        }
    }

    return result;
}