import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { nextRandom, type MapDefinition, type TerrainImage, type Theme } from '@rails/shared';
import { latticeTriangles, vertexJitter } from './terrainMesh.js';

export const LAND_HEIGHT = 2;
const CELL = 7;
const MARGIN = 160;

/** Land and lakes as one flat-shaded lattice mesh with a slight color shift per facet (KTD12). */
export function buildTerrainGeometry(map: MapDefinition, theme: Theme): THREE.BufferGeometry {
  const triangles = latticeTriangles(map.width, map.height, map.terrain.land, map.terrain.lakes, CELL, MARGIN);
  const positions = new Float32Array(triangles.length * 9);
  const colors = new Float32Array(triangles.length * 9);
  const land = new THREE.Color(theme.terrain.land);
  const lake = new THREE.Color(theme.terrain.lake);
  const shade = new THREE.Color();
  let rng = 11;
  triangles.forEach((t, i) => {
    const [r, next] = nextRandom(rng);
    rng = next;
    const isLake = t.kind === 'lake';
    shade.copy(isLake ? lake : land).offsetHSL(0, 0, (r - 0.5) * theme.terrain.landVariation * (isLake ? 0.6 : 2));
    t.corners.forEach(([x, y], k) => {
      const h = isLake ? LAND_HEIGHT - 0.35 : LAND_HEIGHT - 0.25 + vertexJitter(x, y, 0.7);
      positions.set([x, h, y], i * 9 + k * 3);
      colors.set([shade.r, shade.g, shade.b], i * 9 + k * 3);
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function useImageTexture(src: string): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(
      src,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        loaded = t;
        if (alive) setTexture(t);
        else t.dispose();
      },
      undefined,
      () => console.warn(`Map image ${src} could not be loaded.`),
    );
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [src]);
  return texture;
}

/** A map's background picture laid flat as the ground (terrain.image). */
function ImageGround({ image, theme }: { image: TerrainImage; theme: Theme }) {
  const texture = useImageTexture(image.src);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[image.x + image.width / 2, LAND_HEIGHT - 0.2, image.y + image.height / 2]}
      raycast={() => null}
    >
      <planeGeometry args={[image.width, image.height]} />
      {texture ? (
        <meshBasicMaterial map={texture} color={theme.terrain.imageTint ?? '#ffffff'} toneMapped={false} />
      ) : (
        <meshBasicMaterial color={image.surround ?? theme.terrain.water} />
      )}
    </mesh>
  );
}

export function Terrain({ map, theme }: { map: MapDefinition; theme: Theme }) {
  const { width, height, terrain } = map;
  const image = terrain.image;
  const geometry = useMemo(
    () => (!image && terrain.land.length > 0 ? buildTerrainGeometry(map, theme) : null),
    [map, theme, image, terrain.land.length],
  );
  const water = image?.surround
    ? new THREE.Color(image.surround).multiply(new THREE.Color(theme.terrain.imageTint ?? '#ffffff'))
    : new THREE.Color(theme.terrain.water);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[width / 2, 0, height / 2]} raycast={() => null}>
        <planeGeometry args={[width * 4, height * 4]} />
        {image ? <meshBasicMaterial color={water} toneMapped={false} /> : <meshStandardMaterial color={water} flatShading />}
      </mesh>
      {image ? (
        <ImageGround image={image} theme={theme} />
      ) : geometry ? (
        <mesh geometry={geometry} raycast={() => null}>
          <meshStandardMaterial vertexColors flatShading />
        </mesh>
      ) : (
        // A map without land polygons gets a plain land slab under the play area.
        <mesh rotation-x={-Math.PI / 2} position={[width / 2, LAND_HEIGHT - 0.2, height / 2]} raycast={() => null}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial color={theme.terrain.land} flatShading />
        </mesh>
      )}
    </group>
  );
}
