export interface IStaticGeometryAttribute {
    data: Float32Array;
    count: number;
    dynamic: GLenum;
}

export interface IDefaultStaticGeometryAttributes {
    position: IStaticGeometryAttribute;
    normal: IStaticGeometryAttribute;
    uv: IStaticGeometryAttribute;

    // TODO: Implement.
    tangent: IStaticGeometryAttribute;
    color: IStaticGeometryAttribute;
}

export class Geometry {

    attributes: IDefaultStaticGeometryAttributes;

    index: Uint16Array | Uint32Array;

    primitive: string;

    count: number;

    constructor(attributes : IDefaultStaticGeometryAttributes, opts: {index: Uint16Array | Uint32Array, primitive: string}) : Geometry;
}
