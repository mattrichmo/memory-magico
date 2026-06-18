# MemoryMagico Delivery Notes

This package is the MemoryMagico workspace/tool itself.

## Setup

```bash
npm link
mm init
mm doctor
mm index rebuild
```

## Sanity Checks

```bash
mm wiki create "Delivery Check" --kind concept
mm search "delivery check"
mm resolve "delivery check"
mm context "delivery check" --deep
```

## Compatibility

The package exposes `mm` and `memorymagico`.
