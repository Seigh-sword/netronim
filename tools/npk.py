#!/usr/bin/env python3
"""Netronim NPK1 package tool.

NPK is a zip-like container: independently DEFLATE-compressed entries plus a
compressed JSON directory, CRC32 checksums, and required metadata headers.
This tool can package an HTML app or a compiled app.wasm into a real .npk.

Examples:
  python tools/npk.py pack out.npk ./my-app-dir
  python tools/npk.py pack prism.npk --wasm public/wasm/prism.wasm \
      --id prism-flow --name "Prism Flow" --type rendygl
  python tools/npk.py inspect package.npk
  python tools/npk.py unpack package.npk ./extracted
"""
from __future__ import annotations
import argparse, json, struct, zlib, hashlib, sys
from pathlib import Path
from datetime import date

MAGIC = b"NPK\x01"
HEADER = struct.Struct("<4sHHIQQI")
MAX_FILES = 512
MAX_FILE = 24 * 1024 * 1024
MAX_TOTAL = 96 * 1024 * 1024
PERMISSIONS = {"fs:read","fs:write","network","clipboard","notifications","camera","microphone","processes","desktop:read","desktop:write","apps:launch","apps:manage"}

def crc32(data: bytes) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF

def deflate(data: bytes) -> bytes:
    c = zlib.compressobj(level=9, wbits=-15)
    return c.compress(data) + c.flush()

def inflate(data: bytes) -> bytes:
    return zlib.decompress(data, -15)

def safe_name(name: str) -> bool:
    return bool(name) and len(name) < 240 and not name.startswith("/") and "\\" not in name and "\0" not in name and all(p not in ("", ".", "..") for p in name.split("/")) and not name[1:2] == ":"

def encode_npk(files: dict[str, bytes]) -> bytes:
    if len(files) > MAX_FILES:
        raise ValueError(f"NPK supports at most {MAX_FILES} files")
    entries, parts, offset, total = [], [], 0, 0
    for name, data in files.items():
        if not safe_name(name):
            raise ValueError(f"Unsafe archive path: {name}")
        total += len(data)
        if len(data) > MAX_FILE or total > MAX_TOTAL:
            raise ValueError("Package exceeds expanded size limits")
        compressed = deflate(data)
        if len(compressed) < len(data):
            payload, method = compressed, "deflate-raw"
        else:
            payload, method = data, "store"
        entries.append({"name": name, "offset": offset, "length": len(payload), "size": len(data), "crc": crc32(data), "method": method})
        parts.append(payload)
        offset += len(payload)
    directory = deflate(json.dumps(entries, separators=(",", ":")).encode())
    header = HEADER.pack(MAGIC, 1, 0, len(entries), offset, len(directory), 0)
    header = header[:28] + struct.pack("<I", crc32(header[:28]))
    return header + b"".join(parts) + directory

def decode_npk(blob: bytes) -> dict[str, bytes]:
    if len(blob) < 34 or len(blob) > 64 * 1024 * 1024:
        raise ValueError("Invalid or oversized NPK archive")
    magic, version, reserved, count, offset, length, checksum = HEADER.unpack_from(blob, 0)
    if magic != MAGIC or version != 1 or reserved != 0 or crc32(blob[:28]) != checksum:
        raise ValueError("Unsupported or corrupt NPK header")
    if count > MAX_FILES or 32 + offset + length != len(blob):
        raise ValueError("Invalid archive directory bounds")
    entries = json.loads(inflate(blob[32 + offset:]))
    if len(entries) != count:
        raise ValueError("Archive entry count mismatch")
    files, end, total = {}, 0, 0
    for entry in entries:
        name = entry["name"]
        if not safe_name(name) or name in files or entry["offset"] != end:
            raise ValueError(f"Unsafe or duplicate archive entry: {name}")
        payload = blob[32 + entry["offset"]:32 + entry["offset"] + entry["length"]]
        data = inflate(payload) if entry["method"] == "deflate-raw" else payload
        if len(data) != entry["size"] or crc32(data) != entry["crc"]:
            raise ValueError(f"Checksum failed: {name}")
        total += len(data)
        if total > MAX_TOTAL:
            raise ValueError("Archive expanded size exceeds safe limit")
        files[name] = data
        end += entry["length"]
    if "_META/manifest.json" not in files:
        raise ValueError("Missing _META/manifest.json")
    return files

def make_manifest(args) -> dict:
    perms = sorted(set(args.permission or []))
    unknown = set(perms) - PERMISSIONS
    if unknown:
        raise ValueError(f"Unknown permissions: {', '.join(sorted(unknown))}")
    return {
        "id": args.id, "name": args.name, "version": args.app_version,
        "author": args.author, "description": args.description,
        "icon": args.icon, "color": args.color, "type": args.type,
        "min_os_version": "1.0.0", "permissions": perms,
        "category": args.category, "associations": args.associations or [],
    }

def add_metadata(files: dict[str, bytes], manifest: dict, notes: list[str]) -> dict[str, bytes]:
    files = dict(files)
    files["_META/manifest.json"] = json.dumps(manifest, indent=2).encode()
    files["_META/changelog.json"] = json.dumps([{"version": manifest["version"], "date": date.today().isoformat(), "notes": notes}], indent=2).encode()
    files["_HEADERS/api.xml"] = ("<api version=\"1\">" + "".join(f"<permission name=\"{p}\" />" for p in manifest["permissions"]) + "</api>").encode()
    files["_HEADERS/associations.json"] = json.dumps(manifest.get("associations", [])).encode()
    files["_HEADERS/ipc.xml"] = b"<ipc version=\"1\"><interface name=\"netronim.bridge\" /></ipc>"
    return files

def cmd_pack(args):
    files: dict[str, bytes] = {}
    if args.directory:
        root = Path(args.directory)
        for path in sorted(root.rglob("*")):
            if path.is_file():
                name = path.relative_to(root).as_posix()
                files[name] = path.read_bytes()
        manifest = json.loads(files["_META/manifest.json"]) if "_META/manifest.json" in files else make_manifest(args)
    else:
        if args.type == "rendygl":
            if not args.wasm:
                raise ValueError("--wasm is required for rendygl packages")
            files["app.wasm"] = Path(args.wasm).read_bytes()
        else:
            if not args.html:
                raise ValueError("--html is required for html5view packages")
            files["index.html"] = Path(args.html).read_bytes()
        manifest = make_manifest(args)
    if args.type == "rendygl" and "app.wasm" not in files:
        raise ValueError("RendyGL package is missing app.wasm")
    if args.type == "html5view" and "index.html" not in files:
        raise ValueError("HTML5View package is missing index.html")
    files = add_metadata(files, manifest, args.notes or ["Initial release."])
    blob = encode_npk(files)
    Path(args.output).write_bytes(blob)
    print(f"Wrote {args.output} · {len(blob)} bytes · {len(files)} entries · sha256 {hashlib.sha256(blob).hexdigest()}")

def cmd_inspect(args):
    files = decode_npk(Path(args.input).read_bytes())
    manifest = json.loads(files["_META/manifest.json"])
    print(json.dumps(manifest, indent=2))
    print(f"\n{len(files)} entries:")
    for name, data in sorted(files.items()):
        print(f"  {name:48} {len(data):>10} bytes")

def cmd_unpack(args):
    files = decode_npk(Path(args.input).read_bytes())
    root = Path(args.output)
    for name, data in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    print(f"Unpacked {len(files)} entries to {root}")

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pack", help="Create an NPK package")
    p.add_argument("output"); p.add_argument("directory", nargs="?")
    p.add_argument("--wasm"); p.add_argument("--html")
    p.add_argument("--id", default="my-app"); p.add_argument("--name", default="My App")
    p.add_argument("--app-version", default="1.0.0"); p.add_argument("--author", default="Explorer")
    p.add_argument("--description", default="A Netronim application."); p.add_argument("--icon", default="AppWindow")
    p.add_argument("--color", default="#b7a3f7"); p.add_argument("--type", choices=["html5view","rendygl"], default="html5view")
    p.add_argument("--category", default="Utilities"); p.add_argument("--permission", action="append")
    p.add_argument("--associations", nargs="*"); p.add_argument("--notes", nargs="*")
    p.set_defaults(func=cmd_pack)
    p = sub.add_parser("inspect", help="Inspect an NPK package"); p.add_argument("input"); p.set_defaults(func=cmd_inspect)
    p = sub.add_parser("unpack", help="Unpack an NPK package"); p.add_argument("input"); p.add_argument("output"); p.set_defaults(func=cmd_unpack)
    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr); sys.exit(1)

if __name__ == "__main__":
    main()
