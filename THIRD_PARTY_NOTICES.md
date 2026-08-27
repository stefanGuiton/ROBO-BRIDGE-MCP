# Third-party notices

## Three.js

The browser imports Three.js `0.185.0` from jsDelivr at runtime. Three.js is MIT licensed. Before release, consider vendoring the exact files and retaining the upstream licence.

## WebMCP

The project uses the experimental `document.modelContext` API defined by the Web Machine Learning Community Group and implemented experimentally in Chrome. No WebMCP source code is copied into this repository.

## Newton

Newton is an Apache-2.0 Linux Foundation project built on NVIDIA Warp and MuJoCo Warp. This foundation contains only an integration boundary and requirements file. Newton source is not vendored.

## SCARA-SIM

ROBO-SIM-MCP was informed by the user's private SCARA-SIM project. See `PREEXISTING_WORK.md`. Do not publish private or third-party source without a separate licence review.

## Universal Robots DH reference

The Oracle 1 UR10-class kinematics uses published DH dimensions attributed in source to [Universal Robots DH Parameters for calculations of kinematics and dynamics](https://www.universal-robots.com/articles/ur/programming/forward-and-inverse-kinematics/). The project includes no Universal Robots mesh, logo, firmware, or proprietary software; the browser robot visual is procedural and generic.

## Oracle 1 contribution

Oracle 1 supplied dependency-free implementation material and tests. The material was adapted into this repository and is audited in `docs/ORACLE_1_IMPORT_AUDIT.md`. No third-party package was installed for that integration, and no RepRapFirmware source was copied.
