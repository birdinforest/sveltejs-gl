export default "varying vec3 vnormal;\n\n#ifdef USES_TEXTURE\nvarying vec2 vuv;\n#endif\n\nvarying vec3 vsurface_to_light[NUM_LIGHTS];\nvarying vec3 vsurface_to_view[NUM_LIGHTS];\n\nvoid main() {\n\tvec4 pos = vec4(POSITION, 1.0);\n\n\tvnormal = (MODEL_INVERSE_TRANSPOSE * vec4(NORMAL, 0.0)).xyz;\n\n\t#ifdef USES_TEXTURE\n\tvuv = UV;\n\t#endif\n\n\tfor (int i = 0; i < NUM_LIGHTS; i += 1) {\n\t\tPointLight light = POINT_LIGHTS[i];\n\n\t\tvec3 surface_world_position = (MODEL * pos).xyz;\n\t\tvsurface_to_light[i] = light.location - surface_world_position;\n\t\tvsurface_to_view[i] = CAMERA_WORLD_POSITION - surface_world_position;\n\t}\n\n\tgl_Position = PROJECTION * VIEW * MODEL * pos;\n}";