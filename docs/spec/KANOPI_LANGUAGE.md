# Kanopi Session Language — Specification

**Status:** v0.1 (Phase 1 Alpha) · **File extension:** `.kanopi`

A `.kanopi` file declares a **session**: a list of *actors* (live-coding sources),
*scenes* (snapshots of which actors are on/off), and *maps* (MIDI/OSC
inputs routed to commands).

The language is line-oriented and intentionally minimal: every meaningful line
starts with an `@directive`. Anything else is ignored as free-form prose.

---

## 1. Lexical conventions

- One directive per line.
- Tokens within a line are separated by **whitespace** (spaces or tabs, any amount).
- Comments start with `#` and run to end-of-line. They may appear after a directive.
- Blank lines are ignored.
- Identifiers (names) match `[A-Za-z_][A-Za-z0-9_]*`.
- Paths and file references are bare tokens (no quotes), matching `[\w./-]+`.
- Numbers are decimal integers.

---

## 2. Grammar (EBNF)

```ebnf
session    = { line } ;
line       = comment | directive | prose | empty ;

empty      = WS* NL ;
comment    = WS* "#" anychar* NL ;
prose      = (* any line not starting with "@" *) NL ;

directive  = WS* "@" keyword WS+ args inline-comment? NL ;
inline-comment = WS+ "#" anychar* ;

keyword    = "actor" | "scene" | "map" ;

(* @actor name file runtime *)
args       = actor-args | scene-args | map-args ;
actor-args = ident WS+ filepath WS+ runtime ;

(* @scene name [actor-name ...] *)
scene-args = ident { WS+ ident } ;

(* @map source target *)
map-args   = source WS+ target ;

source     = source-kind ":" number [ "/ch" number ] ;
source-kind = "cv" | "trig" | "gate" ;

target     = "tempo"
           | "scene:" ident
           | ident "." ident ;
           (* "<actor>.toggle" or "<actor>.<param>" *)

runtime    = "kanopi" | "strudel" | "tidal" | "hydra" | "sc"
           | "python" | "js" | "system" ;

ident      = letter { letter | digit | "_" } ;
filepath   = (letter | digit | "_" | "/" | "-" | ".") + ;
number     = digit+ ;
WS         = " " | "\t" ;
NL         = "\r"? "\n" ;
letter     = "A".."Z" | "a".."z" ;
digit      = "0".."9" ;
anychar    = ? any character except NL ? ;
```

---

## 3. Directive semantics

### `@actor`

```
@actor <name> <file> <runtime>
```

Declares a live source. `<name>` is a unique identifier within the session.
`<file>` is the path (relative to the workspace) of the code file. `<runtime>`
must be one of the listed runtimes.

**Effect:** the actor appears in the Actors panel. If `<file>` doesn't exist
in the workspace it is created empty.

Redeclaring the same `<name>` raises a warning; the latest declaration wins.

### `@scene`

```
@scene <name> [actor-name ...]
```

Declares a scene = the set of actors that should be **on** when the scene is
activated. Actors not listed will be **off**.

Activating a scene calls `actors.toggle(...)` for each actor whose state
differs from the requested one.

### `@map`

```
@map <source> <target>
```

Routes an external input (MIDI today, OSC later) to a Kanopi command.

#### Source forms

| Source form        | Meaning                                                        |
|--------------------|----------------------------------------------------------------|
| `cv:N`             | MIDI Control Change number `N`, any channel                    |
| `cv:N/chC`         | MIDI Control Change `N` on MIDI channel `C` (1–16)             |
| `trig:N[/chC]`     | MIDI Note-On with note number `N` and velocity > 0 (one-shot)  |
| `gate:N[/chC]`     | MIDI Note-On + Note-Off on note number `N` (fires both)        |

The `cv` / `trig` / `gate` vocabulary is shared with **BPscript**:
- `cv` — continuous value (analog-style)
- `trig` — momentary trigger
- `gate` — sustained on/off

#### Target forms

| Target              | Effect                                                |
|---------------------|-------------------------------------------------------|
| `tempo`             | Sets the global BPM (CC value 0–127 mapped to 60–180) |
| `scene:<name>`      | Activates the named scene                             |
| `<actor>.toggle`    | Toggles the named actor on/off                        |
| `<actor>.<param>`   | Sets a parameter on the actor (not yet implemented)   |

---

## 4. Validation rules

- Unknown directive → error.
- `@actor` with unknown runtime → error.
- `@scene` referencing an undeclared actor → error.
- `@map` target `scene:X` where `X` is not declared → error.
- `@map` target `<actor>.X` where `<actor>` is not declared → error.
- Errors are reported with a line number (and column when the AST is wired).

Validation does not block parsing: the rest of the session keeps loading.

---

## 5. Example

```kanopi
# myset — main session

@actor drums   drums.tidal     tidal
@actor visuals visuals.hydra   hydra
@actor bass    bass.scd        sc

@scene intro   visuals
@scene drop    drums visuals bass
@scene break   visuals bass

@map cv:1     tempo            # knob → BPM
@map trig:36  scene:drop       # pad → scene
@map cv:21    drums.toggle     # knob → toggle (any non-zero value)
```

---

## 6. Extensions (planned)

- `@expose` — expose nested-scene actors (P1).
- `@tempo <bpm>` and `@quantize <bar|beat|...>` — global directives (P1).
- `@map ... range:[lo,hi]` — value scaling (P1).
- Math expressions in targets (P2).
- Numeric/string literals in `@map` targets (P2).
