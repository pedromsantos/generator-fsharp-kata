namespace <%= namespace %>

module <%= namespace %>Kata =
    let ToRoman number = ""

module <%= namespace %>Should =
    open <%= namespace %>Kata
    open NUnit.Framework
    open FsUnit
    
    [<Test>]
    let Fail() = 
        false
        |> should equal true
