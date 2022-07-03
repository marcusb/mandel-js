;; Implementation using SIMD instructions
(module
  ;; must specify max size, 64 pages = 1024x1024 pixels, plus 1 for palette
  (memory (import "env" "buf") 1 65 shared)
  ;; repeated application of the function f(z) = z^2 + w for a single point w
  (func $iterate (param $x v128) (param $y v128) (param $maxIter i32) (result i32 i32)
    (local $a v128)
    (local $b v128)
    (local $aa v128)
    (local $bb v128)
    (local $i v128)
    (local $step v128)
    (local $maxIter2 v128)
    ;; step is the iteration counter step size, initialize to (1, 1).
    ;; Later we will zero out the component for which the iteration has escaped.
    (local.set $step
      (i64x2.splat (i64.const 1)))
    ;; (maxIter, maxIter)
    (local.set $maxIter2
      (i64x2.extend_low_i32x4_u (i32x4.splat (local.get $maxIter))))
    ;; z = a + bi
    ;; w = x + y i
    ;; The update is z := z^2 + w
    ;; We save some multiplications by also storing
    ;;   aa = a*a
    ;;   bb = b*b
    ;; so they can be re-used in the following round.
    (loop $top
      ;; Simultaneous update:
      ;;   a := aa - bb + x
      ;;   b := 2*a*b + y
      (f64x2.add
        (f64x2.sub (local.get $aa) (local.get $bb))
        (local.get $x))
      (f64x2.relaxed_madd
        (local.get $y)
        (f64x2.add (local.get $a) (local.get $a))
        (local.get $b))
      ;; a^2 + b^2
      (local.set $bb
        (f64x2.mul
          (local.tee $b) (local.get $b)))
      (local.tee $aa
        (f64x2.mul
          (local.tee $a)
          (local.get $a)))
      (f64x2.add (local.get $bb))
      ;; Check the exit condition a^2 + b^2 > 4 for both lanes.
      (v128.const f64x2 4 4)
      (f64x2.lt)
      ;; This is combined with a step update - we stop the iteration counter for
      ;; any lane that meets the stop condition.
      ;; (Since we are iterating both lanes in parallel, we will keep computing
      ;; the function until both lanes are done, but no longer increase the iteration
      ;; counter for the finished lane.)
      (local.tee $step
        ;; Comparison gives all-ones if true, and all-zero if false, for each lane.
        ;; We use this as bitmask, zeroing out any lane that should stop iterating.
        (v128.and (local.get $step)))
      ;; iteration counter update - this is a no-op for any lane that has finished.
      ;; i += step
      (local.tee $i (i64x2.add (local.get $i)))
      ;; Check max iterations reached and update step accordingly.
      (local.get $maxIter2)
      (i64x2.lt_s)
      (local.tee $step (v128.and (local.get $step)))
      ;; loop if step is still non-zero
      (br_if $top (v128.any_true)))
    (return
      (i32x4.extract_lane 0 (local.get $i))
      (i32x4.extract_lane 2 (local.get $i))))

  (func $mandel
    (param $ofs i32)
    (param $rows i32)
    (param $cols i32)
    (param $x0 f64)
    (param $y f64)
    (param $dx f64)
    (param $dy f64)
    (param $maxIter i32)
    (local $i i32)
    (local $x f64)
    (local $iter i32)

    ;; loop over rows counting backwards to 0
    (loop $nextRow
      (local.set $rows (i32.sub (local.get $rows) (i32.const 1)))
      (local.set $i (i32.const 0))
      (local.set $x (local.get $x0))
      ;; loop over columns
      (loop $nextCol
        ;; SIMD iteration calculates two points at a time, returning two iteration counts
        (local.get $ofs)
        (call $iterate
          ;; (x, x+dx)
          (f64x2.replace_lane
            1
            (f64x2.splat (local.get $x))
            (f64.add (local.get $x) (local.get $dx)))
          ;; (y, y)
          (f64x2.splat (local.get $y))
          (local.get $maxIter))
        (local.set $iter) ;; save iteration count for second point
        ;; stack top holds iteration count for first point
        ;; load palette value corresponding to the iteration count, at offset 4*iter
        (i32.const 2)
        (i32.shl)
        (i32.load)
        (i32.store)
        ;; same for second iteration count
        (local.tee $ofs (i32.add (local.get $ofs) (i32.const 4)))
        (local.get $iter)
        (i32.const 2)
        (i32.shl)
        (i32.load)
        (i32.store)
        (local.set $ofs (i32.add (local.get $ofs) (i32.const 4)))
        (local.set $x (f64.add (f64.add (local.get $x) (local.get $dx)) (local.get $dx)))
        (local.set $i (i32.add (local.get $i) (i32.const 2)))
        (br_if $nextCol
          (i32.lt_u
            (local.get $i)
            (local.get $cols))))
      (local.set $y (f64.sub (local.get $y) (local.get $dy)))
      (br_if $nextRow
        (local.get $rows)))
  )
  (export "mandel" (func $mandel))
)
