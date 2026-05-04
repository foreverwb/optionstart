interface VolumeLayerProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

export function VolumeLayer({ canvasRef }: VolumeLayerProps) {
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        bottom: 22,
        left: 0,
        width: '100%',
        height: 40,
        pointerEvents: 'none',
        opacity: 0.5,
      }}
    />
  )
}
