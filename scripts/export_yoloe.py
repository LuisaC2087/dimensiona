"""
CR-04: exporta el modelo YOLOE (reconocimiento de objetos en el teléfono, sin internet)
con una lista de objetos de interiores. Salida: assets/models/dimensiona-yoloe.onnx
Uso:  python scripts/export_yoloe.py   (requiere: pip install ultralytics onnx)
Las etiquetas en español están en src/lib/objectLabels.ts (mismo orden no requerido).
"""
import shutil, sys
from pathlib import Path

# Sin «person» a propósito (RNF de privacidad: la app no reconoce personas).
CLASSES = [
    "chair", "armchair", "sofa", "table", "dining table", "coffee table", "desk", "bed", "nightstand",
    "wardrobe", "cabinet", "dresser", "bookshelf", "shelf", "door", "window", "curtain", "rug", "mirror",
    "picture frame", "television", "computer monitor", "laptop", "refrigerator", "microwave", "oven", "stove",
    "washing machine", "sink", "toilet", "bathtub", "shower", "lamp", "ceiling light", "potted plant", "vase",
    "box", "suitcase", "basket", "trash can", "fan", "air conditioner", "stool", "bench", "pillow", "speaker",
    "printer", "kitchen counter", "bottle", "cup", "book", "clock", "power outlet", "light switch", "stairs",
    "backpack", "guitar", "bicycle", "piano", "fireplace", "toy", "keyboard", "cell phone",
]

def main():
    from ultralytics import YOLOE
    weights = sys.argv[1] if len(sys.argv) > 1 else "yoloe-26n-seg.pt"
    model = YOLOE(weights)
    model.set_classes(CLASSES, model.get_text_pe(CLASSES))
    path = model.export(format="onnx", imgsz=640, nms=True, opset=19, simplify=False)
    out = Path(__file__).resolve().parent.parent / "assets" / "models" / "dimensiona-yoloe.onnx"
    shutil.copy(path, out)
    print(f"[export] listo -> {out} ({out.stat().st_size / 1e6:.1f} MB, {len(CLASSES)} clases)")

if __name__ == "__main__":
    main()
