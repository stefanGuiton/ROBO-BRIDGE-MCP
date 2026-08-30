export function disposeObjectTree(scene, object) {
  const disposed = { geometries: 0, materials: 0, textures: 0 };
  if (!object) return disposed;
  object.traverse((child) => {
    if (child.geometry) { child.geometry.dispose(); disposed.geometries += 1; }
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) { value.dispose(); disposed.textures += 1; }
      }
      material.dispose();
      disposed.materials += 1;
    }
  });
  scene.remove(object);
  return disposed;
}
