;; Implementation using shared memory
(module
  ;; must specify max size, 64 pages = 1024x1024 pixels, plus 1 for palette
  (memory (import "env" "buf") 1 65 shared)
  ;; repeated application of the function f(z) = z^2 + w for a single point w
  (func $iterate (param $x f64) (param $y f64) (param $maxIter i32) (result i32)
    (local $a f64)
    (local $b f64)
    (local $aa f64)
    (local $bb f64)
    (local $i i32)
    ;; z = a + bi
    ;; w = x + y i
    ;; The update is z := z^2 + w
    ;; We save some multiplications by also storing
    ;;   aa = a*a
    ;;   bb = b*b
    ;; so they can be re-used in the following round.
    (block $break
      (loop $top
        ;; tmp = aa - bb + x
        (f64.add
          (f64.sub (local.get $aa) (local.get $bb))
          (local.get $x))
        ;; b = 2*a*b + y
        (local.set $b
          (f64.add
            (f64.mul
              (f64.add (local.get $a) (local.get $a))
              (local.get $b))
            (local.get $y)))
        ;; a = tmp
        (local.set $a)
        ;; aa = a * a
        (local.set $aa
          (f64.mul (local.get $a) (local.get $a)))
        ;; break if aa > 4)
        (br_if $break
          (f64.gt (local.get $aa) (f64.const 4)))
        ;; bb = b * b;
        (local.set $bb
          (f64.mul (local.get $b) (local.get $b)))
        ;; break if (aa + bb > 4)
        (br_if $break
          (f64.gt
            (f64.add (local.get $aa) (local.get $bb))
            (f64.const 4)))
        (local.set $i
          (i32.add (local.get $i) (i32.const 1)))
        (br_if $top
          (i32.lt_u
            (local.get $i)
            (local.get $maxIter)))
      )
    )
    (return (local.get $i)))

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

    (loop $nextRow
      ;; loop over rows counting backwards to 0
      (local.set $rows (i32.sub (local.get $rows) (i32.const 1)))
      (local.set $i (i32.const 0))
      (local.set $x (local.get $x0))
      (loop $nextCol
        ;; loop over columns
        (i32.store
          (local.get $ofs)
          ;; load palette value corresponding to the iteration count, at offset 4*iter
          (i32.load
            (i32.shl
              (call $iterate (local.get $x) (local.get $y) (local.get $maxIter))
              (i32.const 2))))
        (local.set $x (f64.add (local.get $x) (local.get $dx)))
        (local.set $ofs (i32.add (local.get $ofs) (i32.const 4)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $nextCol
          (i32.lt_u
            (local.get $i)
            (local.get $cols))))
      (local.set $y (f64.sub (local.get $y) (local.get $dy)))
      (br_if $nextRow
        (i32.gt_u
          (local.get $rows)
          (i32.const 0))))
  )
  (export "mandel" (func $mandel))
)
