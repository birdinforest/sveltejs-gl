

/**
 * @typedef GLTFLoaderLib
 * @property {string}         url             - Url of .gltf file.
 * @property {GLTFInfo}       gltfInfo
 * @property {ArrayBuffer[]}  buffers
 * @property {ArrayBuffer[]}  bufferViews     - Array buffer clips indices basis on buffer view index in glTF#json#BufferViews
 * @property {[]}             materials
 * @property {[]}             textures
 * @property {[][]}           meshes
 * @property {[]}             joints
 * @property {[]}             skeletons
 * @property {[]}             cameras
 * @property {[]}             nodes
 * @property {object[]}       clips
 */

/**
 * @typedef GLTFLoaderMesh
 * @property {string}           name
 * @property {SvelteGeometry}   geometry
 * @property {Object}           material
 * @property {boolean}          culling
 * @property {number}           mode
 */

import { base64ToBinary, relative2absolute, generateVertexNormals, generateTangents } from '../internal/utils.mjs';
import { vec3, mat4, quat } from 'gl-matrix';
import SvelteGeometry from '../geometry/Geometry.mjs';
import * as constants from '../internal/constants.mjs';

const GLTF_EXTENSIONS = {
  KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
  WEB3D_QUANTIZED_ATTRIBUTES: 'WEB3D_quantized_attributes',
}

const semanticAttributeMap = {
  'NORMAL': 'normal',
  'POSITION': 'position',
  'TANGENT': 'tangent',
  'TEXCOORD_0': 'uv',
  'TEXCOORD_1': 'uv1',
  'WEIGHTS_0': 'weight',
  'JOINTS_0': 'joint',
  'COLOR_0': 'color'
};

const attributeSemanticMap = {
  'normal': 'NORMAL',
  'position': 'POSITION',
  'tangent': 'TANGENT',
  'uv': 'TEXCOORD_0',
  'uv1': 'TEXCOORD_1',
  'weight': 'WEIGHTS_0',
  'joint': 'JOINTS_0',
  'color': 'COLOR_0'
};

const ARRAY_CTOR_MAP = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
};

const ARRAY_COMPONENT_BYTE_LENGTH = {
  5120: Int8Array.BYTES_PER_ELEMENT,                  // 1
  5121: Uint8Array.BYTES_PER_ELEMENT,                 // 1
  5122: Int16Array.BYTES_PER_ELEMENT,                 // 2
  5123: Uint16Array.BYTES_PER_ELEMENT,                // 2
  5125: Uint32Array.BYTES_PER_ELEMENT,                // 4
  5126: Float32Array.BYTES_PER_ELEMENT,               // 4
};

const SIZE_MAP = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};

class Node {
  constructor(name) {
    this.position = vec3.create();
    this.rotation = quat.create();
    this.scale = vec3.fromValues(1,1,1);
    this.localTransform = mat4.create();
    this.worldTransform = mat4.create();
    this.name = name;
    this._children = [];
  }

  add(obj) {
    this._children.push(obj);
  }
}

/**
 * GLTF Loader.
 * @Reference: https://github.com/pissang/claygl/blob/master/src/loader/GLTF.js
 */
export default class GLTFLoader {
  /**
   * @param {string} [opt = undefined]    - The loader options.
   * @param {string} opt.rootPath         - The root path of gltf file.
   * @param {string} opt.bufferRootPath   - The root path of buffer.
   * @param {string} opt.textureRootPath  - The root path of texture.
   * @param {string} opt.includeTexture   - If load texture.
   * @param {string} opt.includeCamera    - If load camera.
   * @param {string} opt.includeAnimation - If load animation.
   */
  constructor(opt = undefined) {
    opt = opt || {};
    this.rootPath = opt.rootPath;
    this.bufferRootPath = opt.bufferRootPath;
    this.textureRootPath = opt.textureRootPath;
    this.includeTexture = opt.includeTexture || true;
    this.includeCamera = opt.includeCamera || false;
    this.includeAnimation = opt.includeAnimation || true;
  }

  /**
   * Load model.
   * @param {string} url
   * @param {object | undefined} opts
   * @returns {Promise<void>}
   */
  async loadModel(url, opts) {
    // TODO: Implement opts

    if(!url || url == '') {
      throw new Error('GLTFLoader.loadModel: Given url is undefined or empty.');
      return;
    }

    /** @type GLTFLoaderLib */
    const lib = {
      url: url,
      gltfInfo: null,
      buffers: [],
      bufferViews: [],
      materials: [],
      textures: [],
      meshes: [],
      joints: [],
      skeletons: [],
      cameras: [],
      nodes: [],
      clips: [],
    };

    if (this.rootPath == null) {
      this.rootPath = url.slice(0, url.lastIndexOf('/'));
    }

    if(this.bufferRootPath == null) {
      this.bufferRootPath = this.rootPath;
    }

    if(this.textureRootPath == null) {
      this.textureRootPath = this.rootPath;
    }

    const response = await fetch(url);

    const contentType = response.headers.get('content-type');

    let data;

    if(contentType.includes('model/gltf+json')) {
      data = await response.json();
      return this._parseGLTF(data, lib, null);
    } else if(contentType.includes('model/gltf-binary')) {
      data = await response.arrayBuffer();
    } else {
      throw new Error(
        'GLTFLoader.loadModel: Given url asset is not validated gltf file.' +
        'Expecting content type is "model/gltf+json" or "model/gltf-binary' +
        'Get ' + contentType);
    }
  }

  /**
   * @param {GLTFInfo} gltfInfo
   * @param {GLTFLoaderLib} lib
   * @param {ArrayBuffer[]} [buffer]
   * @return {Promise<object>}
   */
  _parseGLTF (gltfInfo, lib, buffers) {
    const self = this;

    lib.gltfInfo = gltfInfo;

    let loading = 0;

    return new Promise((resolve, reject) => {

      function checkLoad() {
        loading--;
        if(loading === 0) {
          console.log('GLTFLoader. return afterLoadBuffer by checkLoad()');
          return afterLoadBuffer(resolve, reject);
        }
      }

      // If already load buffers
      if(buffers) {
        lib.buffers = buffers.slice();

        console.log('GLTFLoader. return afterLoadBuffer if had loaded buffers');
        return afterLoadBuffer(resolve, reject);
      } else {
        // Load buffers
        gltfInfo.buffers.forEach((bufferInfo, idx) => {
          loading++;
          const path = bufferInfo.uri;

          self._loadBuffers(
            path,
            (buffer) => {
              lib.buffers[idx] = buffer;
              checkLoad();
            },
            (error) => {
              throw new Error(
                `GLTFLoader.parseGLTF: Can not load buffer by given uri.\nError ${error}.\nurl: ${path}`);
              checkLoad()
            });
        });
      }

      /**
       * Parse meshes, textures, and return gltf lib after buffer loading.
       * @returns {Promise<object>}
       */
      async function afterLoadBuffer(resolve, reject) {
        // Buffer not load complete.
        if(lib.buffers.length !== gltfInfo.buffers.length) {
          setTimeout(function() {
            console.log('GLTFLoader#afterLoadBuffer. reject.');
            reject('GLTFLoader._parseGLTF: Can not load all buffers.');
          });
        }

        gltfInfo.bufferViews.forEach((bufferViewInfo, idx) => {
          // PENDING Performance
          lib.bufferViews[idx] = lib.buffers[bufferViewInfo.buffer]
            .slice(bufferViewInfo.byteOffset || 0, (bufferViewInfo.byteOffset || 0) + (bufferViewInfo.byteLength || 0));
        });
        lib.buffers = null;

        const parseMeshesPendings = self._parseMeshes(gltfInfo, lib);

        // TODO: Parse texture.

        let pendingArray = [parseMeshesPendings];

        pendingArray = pendingArray.flat();  // Depth 1 flatten.

        await Promise.all(pendingArray);

        console.log('GLTFLoader#afterLoadBuffer. lib: ', lib);

        self._parseNodes(gltfInfo, lib);

        //   // Only support one scene.
        //   if (json.scenes) {
        //     var sceneInfo = json.scenes[json.scene || 0]; // Default use the first scene.
        //     if (sceneInfo) {
        //       for (var i = 0; i < sceneInfo.nodes.length; i++) {
        //         var node = lib.nodes[sceneInfo.nodes[i]];
        //         node.update();
        //         rootNode.add(node);
        //       }
        //     }
        //   }
        //
        //   if (self.includeMesh) {
        //     self._parseSkins(json, lib);
        //   }
        //
        //   if (self.includeAnimation) {
        //     self._parseAnimations(json, lib);
        //   }
        //   if (immediately) {
        //     setTimeout(function () {
        //       self.trigger('success', getResult());
        //     });
        //   } else {
        //     self.trigger('success', getResult());
        //   }

        resolve(lib);
      }
    });
  }

  /**
   * Parse all meshes and create geometries.
   * @param {GLTFInfo} gltfInfo
   * @param {GLTFLoaderLib} lib
   * @returns {Promise<void>}
   * @private
   */
  _parseMeshes (gltfInfo, lib) {

    // return new Promise((resolve, reject) => {
      console.log('GLTFLoader#_parseMeshes: lib:', lib);
      const pendings = [];

      gltfInfo.meshes.forEach(function (meshInfo, idx) {
        lib.meshes[idx] = [];

        // Geometry
        for (let pp = 0; pp < meshInfo.primitives.length; pp++) {

          const promise = new Promise((resolve, reject) => {

            const primitiveIndex = pp;
            /** @type {MeshPrimitiveInfo} */
            const primitiveInfo = meshInfo.primitives[pp];

            const geometry = {
              attributes: {
                position: {
                  data: null,
                  size: 3
                },
                normal: {
                  data: null,
                  size: 3
                },
                uv: {
                  data: null,
                  size: 2
                }
              },
              index: null
            }

            // Don't support draco compression.
            const dracoInfo = primitiveInfo.extensions && primitiveInfo.extensions[GLTF_EXTENSIONS.KHR_DRACO_MESH_COMPRESSION];
            if(dracoInfo) {
              reject(`GLTFLoader._parseMeshes: Don not support DRACO. Mesh: ${idx}, primitive ${primitiveIndex}`);
            } else {
              // Parse attributes
              const semantics = Object.keys(primitiveInfo.attributes);
              for(let ss = 0; ss < semantics.length; ss++) {
                const semantic = semantics[ss];
                const accessorIdx = primitiveInfo.attributes[semantic];
                const attributeInfo = gltfInfo.accessors[accessorIdx];
                const attributeName = semanticAttributeMap[semantic];
                if(!attributeName) {
                  continue;
                }
                const size = SIZE_MAP[attributeInfo.type];

                let attributeArray = this._getAccessorData(gltfInfo, lib, accessorIdx);
                // WebGL attribute buffer not support uint32.
                // Direct use Float32Array may also have issue.
                if(attributeArray instanceof Uint32Array) {
                  attributeArray = new Float32Array(attributeArray);
                }
                if(semantic === 'WEIGHTS_0' && size === 4) {
                  // Weight data in QTEK has only 3 component, the last component can be evaluated since it is normalized
                  const weightArray = new attributeArray.constructor(attributeInfo.count * 3);
                  for(let i = 0; i < attributeInfo.count; i++) {
                    const i4 = i * 4, i3 = i * 3;
                    const w1 = attributeArray[i4], w2 = attributeArray[i4 + 1], w3 = attributeArray[i4 + 2],
                      w4 = attributeArray[i4 + 3];
                    const wSum = w1 + w2 + w3 + w4;
                    weightArray[i3] = w1 / wSum;
                    weightArray[i3 + 1] = w2 / wSum;
                    weightArray[i3 + 2] = w3 / wSum;
                  }
                  geometry.attributes[attributeName].data = weightArray;
                } else if(semantic === 'COLOR_0' && size === 3) {
                  const colorArray = new attributeArray.constructor(attributeInfo.count * 4);
                  for(let i = 0; i < attributeInfo.count; i++) {
                    const i4 = i * 4, i3 = i * 3;
                    colorArray[i4] = attributeArray[i3];
                    colorArray[i4 + 1] = attributeArray[i3 + 1];
                    colorArray[i4 + 2] = attributeArray[i3 + 2];
                    colorArray[i4 + 3] = 1;
                  }
                  geometry.attributes[attributeName].data = colorArray;
                } else {
                  geometry.attributes[attributeName].data = attributeArray;
                }

                let attributeType = 'float';
                if(attributeArray instanceof Uint16Array) {
                  attributeType = 'ushort';
                } else if(attributeArray instanceof Int16Array) {
                  attributeType = 'short';
                } else if(attributeArray instanceof Uint8Array) {
                  attributeType = 'ubyte';
                } else if(attributeArray instanceof Int8Array) {
                  attributeType = 'byte';
                }
                geometry.attributes[attributeName].type = attributeType;

                geometry.attributes[attributeName].size = size;

                if(semantic === 'POSITION') {
                  // TODO: Bounding Box
                  geometry.boundingBox = {};
                  const min = attributeInfo.min;
                  const max = attributeInfo.max;
                  if(min) {
                    geometry.boundingBox.min = min;
                  }
                  if(max) {
                    geometry.boundingBox.max = max;
                  }
                }
              }

              const vertexCount = geometry.attributes.position
                && (geometry.attributes.position.data.length / geometry.attributes.position.size)
                || 0;

              // Parse indices
              // TODO: use Uint16Array if vertex count less than 0xffff.
              if(primitiveInfo.indices != null) {
                geometry.indices = this._getAccessorData(gltfInfo, lib, primitiveInfo.indices, true);
                geometry.indices = new Uint32Array(geometry.indices);
                // if(vertexCount <= 0xffff && geometry.indices instanceof Uint32Array) {
                //   geometry.indices = new Uint16Array(geometry.indices);
                // }
                // if(geometry.indices instanceof Uint8Array) {
                //   geometry.indices = new Uint16Array(geometry.indices);
                // }
              }

              // // FIXME: Material support
              // let material = lib.materials[primitiveInfo.material];
              // let materialInfo = (gltfInfo.materials || [])[primitiveInfo.material];
              // // Use default material
              // if (!material) {
              //   material = new Material({
              //     shader: self._getShader()
              //   });
              // }

              // FIXME: Not sure if we need a interface/class for mesh.
              // FIXME: Update `geometry.primitive`?
              const primitive = {
                geometry: new SvelteGeometry({
                  position: {
                    data: geometry.attributes.position.data,
                    size: geometry.attributes.position.size,
                  },
                  normal: {
                    data: geometry.attributes.normal.data,
                    size: geometry.attributes.normal.size,
                  },
                  uv: {
                    data: geometry.attributes.uv.data,
                    size: geometry.attributes.uv.size,
                  }
                }, {
                  index: geometry.indices,
                }),
                material: null,
                mode: [constants.POINTS, constants.LINES, constants.LINE_LOOP, constants.LINE_STRIP, constants.TRIANGLES, constants.TRIANGLE_STRIP, constants.TRIANGLE_FAN][primitiveInfo.mode] || constants.TRIANGLES,
                // ignoreGBuffer: material.transparent
              }

              // if (materialInfo != null) {
              //   primitive.culling = !materialInfo.doubleSided;
              // }

              if(!primitive.geometry.attributes.normal.data) {
                generateVertexNormals(primitive.geometry);
              }
              // if (((material instanceof StandardMaterial) && material.normalMap)
              //   || (material.isTextureEnabled('normalMap'))
              // ) {
              //   if (!primitive.geometry.attributes.tangent && primitive.geometry.attributes.tangent.data) {
              //     primitive.geometry.attributes.tangent = {};
              //     generateVertexNormals(primitive.geometry);
              //   }
              // }
              // if (mesh.geometry.attributes.color.data) {
              //   primitive.material.define('VERTEX_COLOR');
              // }

              lib.meshes[idx].push(primitive);
              resolve();
            }
          });
          pendings.push(promise);
        }
      }, this);

      return pendings;

    //   Promise.all(pendings).then(() => resolve(lib));
    // });
  }

  _loadBuffers (path, onsuccess, onerror) {
    const base64Prefix = 'data:application/octet-stream;base64,';
    const strStart = path.substr(0, base64Prefix.length);
    if (strStart === base64Prefix) {
      onsuccess(
        base64ToBinary(path, base64Prefix.length)
      );
    }
    else {
        const bufferPath = this._resolveBufferPath(path);

        fetch(bufferPath)
          .then(response => response.arrayBuffer())
          .then(buffer => onsuccess(buffer))
          .catch(e => onerror(e));
    }
  }

  /**
   * Binary file path resolver.
   * @param {string} path
   */
  _resolveBufferPath (path) {
    if (path && path.match(/^data:(.*?)base64,/)) {
      return path;
    }

    return relative2absolute(path, this.bufferRootPath);
  }

  // /**
  //  * Parse glTF binary
  //  * @param {ArrayBuffer} buffer
  //  * @param {GLTFLoaderLib} lib
  //  * @return {clay.loader.GLTF.Result}
  //  */
  // parseBinary (buffer, lib) {
  //   var header = new Uint32Array(buffer, 0, 4);
  //   if (header[0] !== 0x46546C67) {
  //     this.trigger('error', 'Invalid glTF binary format: Invalid header');
  //     return;
  //   }
  //   if (header[0] < 2) {
  //     this.trigger('error', 'Only glTF2.0 is supported.');
  //     return;
  //   }
  //
  //   var dataView = new DataView(buffer, 12);
  //
  //   var json;
  //   var buffers = [];
  //   // Read chunks
  //   for (var i = 0; i < dataView.byteLength;) {
  //     var chunkLength = dataView.getUint32(i, true);
  //     i += 4;
  //     var chunkType = dataView.getUint32(i, true);
  //     i += 4;
  //
  //     // json
  //     if (chunkType === 0x4E4F534A) {
  //       var arr = new Uint8Array(buffer, i + 12, chunkLength);
  //       // TODO, for the browser not support TextDecoder.
  //       var decoder = new TextDecoder();
  //       var str = decoder.decode(arr);
  //       try {
  //         json = JSON.parse(str);
  //       }
  //       catch (e) {
  //         this.trigger('error', 'JSON Parse error:' + e.toString());
  //         return;
  //       }
  //     }
  //     else if (chunkType === 0x004E4942) {
  //       buffers.push(buffer.slice(i + 12, i + 12 + chunkLength));
  //     }
  //
  //     i += chunkLength;
  //   }
  //   if (!json) {
  //     this.trigger('error', 'Invalid glTF binary format: Can\'t find JSON.');
  //     return;
  //   }
  //
  //   return this.parse(json, lib, buffers);
  // }

  /**
   * Get data by given accessor index
   * @param {GLTFInfo} gltfInfo
   * @param {GLTFLoaderLib} lib
   * @param {number} accessorIdx
   * @param {boolean} [isIndices]
   * @returns {Float32Array | Uint32Array}
   */
  _getAccessorData(gltfInfo, lib, accessorIdx, isIndices) {
    const accessorInfo = gltfInfo.accessors[accessorIdx];

    const buffer = lib.bufferViews[accessorInfo.bufferView];
    const byteOffset = accessorInfo.byteOffset || 0;
    const ArrayCtor = ARRAY_CTOR_MAP[accessorInfo.componentType] || Float32Array;

    let size = SIZE_MAP[accessorInfo.type];
    if (size == null && isIndices) {
      size = 1;
    }

    let arr = new ArrayCtor(buffer, byteOffset, size * accessorInfo.count);

    const quantizeExtension = accessorInfo.extensions && accessorInfo.extensions[GLTF_EXTENSIONS.WEB3D_QUANTIZED_ATTRIBUTES];
    if (quantizeExtension) {
      const decodedArr = new Float32Array(size * accessorInfo.count);
      const decodeMatrix = quantizeExtension.decodeMatrix;
      const decodeOffset = new Array(size);
      const decodeScale = new Array(size);
      for (let k = 0; k < size; k++) {
        decodeOffset[k] = decodeMatrix[size * (size + 1) + k];
        decodeScale[k] = decodeMatrix[k * (size + 1) + k];
      }
      for (let i = 0; i < accessorInfo.count; i++) {
        for (let k = 0; k < size; k++) {
          decodedArr[i * size + k] = arr[i * size + k] * decodeScale[k] + decodeOffset[k];
        }
      }

      arr = decodedArr;
    }
    return arr;
  }

  /**
   * Create nodes tree.
   * @param {GLTFInfo} gltfInfo
   * @param {GLTFLoaderLib} lib
   * @private
   */
  _parseNodes(gltfInfo, lib) {

    /**
     * Convert primitive to mesh.
     * @param {Object} primitive
     * @returns {GLTFLoaderMesh}
     */
    function instanceMesh(primitive) {
      return {
        name: primitive.name,
        geometry: primitive.geometry,
        material: primitive.material,
        culling: primitive.culling || true,
        mode: primitive.mode,
      };
    }

    gltfInfo.nodes.forEach(function (nodeInfo, idx) {
      let node;
      if (nodeInfo.camera != null && this.includeCamera) {
        // TODO
      } else if (nodeInfo.mesh != null) {
        const primitives = lib.meshes[nodeInfo.mesh];
        if (primitives) {
          // if (primitives.length === 1) {
          //   // Replace the node with mesh directly
          //   node = instanceMesh(primitives[0]);
          //   node.name = nodeInfo.name;
          // } else {
            node = new Node(nodeInfo.name);
            for (let j = 0; j < primitives.length; j++) {
              const newMesh = instanceMesh(primitives[j]);
              node.add(newMesh);
            }
          // }
        }
      } else {
        node = new Node(nodeInfo.name);
      }

      if (nodeInfo.matrix) {
        mat4.set(node.localTransform, ...nodeInfo.matrix);
        mat4.getTranslation(node.position, node.localTransform);
        mat4.getRotation(node.rotation, node.localTransform);
        mat4.getScaling(node.scale, node.localTransform);
      }
      else {
        if (nodeInfo.translation) {
          vec3.set(node.position, ...nodeInfo.translation);
        }
        if (nodeInfo.rotation) {
          quat.set(node.rotation, ...nodeInfo.rotation);
        }
        if (nodeInfo.scale) {
          vec3.set(node.scale, ...nodeInfo.scale);
        }
      }

      lib.nodes[idx] = node;
    }, this);

    // Build hierarchy
    gltfInfo.nodes.forEach(function (nodeInfo, idx) {
      const node = lib.nodes[idx];
      if (nodeInfo.children) {
        for (let i = 0; i < nodeInfo.children.length; i++) {
          const childIdx = nodeInfo.children[i];
          const child = lib.nodes[childIdx];
          node.add(child);
        }
      }
    });
  }
}
