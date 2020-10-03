/**
 * @typedef GLTFLoaderLib
 * @property {string} url                   - Url of .gltf file.
 * @property {object} json
 * @property {ArrayBuffer[]} buffers
 * @property {ArrayBuffer[]} bufferViews    - Array buffer clips indices basis on buffer view index in glTF#json#BufferViews
 * @property {[]} materials
 * @property {[]} textures
 * @property {[][]} meshes
 * @property {[]} joints
 * @property {[]} skeletons
 * @property {[]} cameras
 * @property {[]} nodes
 * @property {object[]} clips
 */

import { base64ToBinary, relative2absolute } from '../internal/utils.mjs';

export default class GLTFLoader {
  /**
   * @param {string} opt.rootPath         - The root path of gltf file.
   * @param {string} opt.bufferRootPath   - The root path of buffer.
   * @param {string} opt.textureRootPath  - The root path of texture.
   * @param {string} opt.includeTexture   - If load texture.
   */
  constructor(opt) {
    opt = opt || {};
    this.rootPath = opt.rootPath;
    this.bufferRootPath = opt.bufferRootPath;
    this.textureRootPath = opt.textureRootPath;
    this.includeTexture = opt.includeTexture;
  }

  /**
   * Load model.
   * @param {string} url
   * @returns {Promise<void>}
   */
  async loadModel(url) {

    /** @type GLTFLoaderLib */
    const lib = {
      url: url,
      json: {},
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
      this.parseGLTF(data, lib, null);
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
   * @param {object} json
   * @param {GLTFLoaderLib} lib
   * @param {ArrayBuffer[]} [buffer]
   * @return {object}
   */
  parseGLTF (json, lib, buffers) {
    const self = this;

    lib.json = json;

    let loading = 0;
    function checkLoad() {
      loading--;
      if (loading === 0) {
        afterLoadBuffer();
      }
    }

    // If already load buffers
    if (buffers) {
      lib.buffers = buffers.slice();
      afterLoadBuffer();
    }
    else {
      // Load buffers
      json.buffers.forEach((bufferInfo, idx) => {
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

    function getResult() {
      return {
        // json: json,
        // scene: self.rootNode ? null : rootNode,
        // rootNode: self.rootNode ? rootNode : null,
        // cameras: lib.cameras,
        // textures: lib.textures,
        // materials: lib.materials,
        // skeletons: lib.skeletons,
        // meshes: lib.instancedMeshes,
        // instancedMeshesMap: lib.instancedMeshesMap,
        // clips: lib.clips,
        // nodes: lib.nodes,
      };
    }

    async function afterLoadBuffer() {
      // Buffer not load complete.
      if (lib.buffers.length !== json.buffers.length) {
        setTimeout(function () {
          throw new Error('GLTFLoader.parseGLTF: Can not load all buffers.');
        });
        return;
      }

      json.bufferViews.forEach((bufferViewInfo, idx) => {
        // PENDING Performance
        lib.bufferViews[idx] = lib.buffers[bufferViewInfo.buffer]
          .slice(bufferViewInfo.byteOffset || 0, (bufferViewInfo.byteOffset || 0) + (bufferViewInfo.byteLength || 0));
      });
      lib.buffers = null;

      await self._parseMeshes(json, lib);

      // var pendingArray = [pendingsParseMesh];
      // var flattenPendings = pendingArray.flat();  // Depth 1 flatten.

      // // Waiting for all promises have been done.
      // pending.then(function() {
      //   self._parseNodes(json, lib);
      //
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
      // });
    }

    return getResult();
  }

  async _parseMeshes (json, lib) {
    console.log('lib:', lib, '\ntodo: parse meshes');
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
}
