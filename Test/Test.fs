namespace Test

module TestKata =
    let ToRoman number = ""

module TestShould =
    open TestKata
    open NUnit.Framework
    open FsUnit
    
    [<Test>]
    let Fail() = 
        false
        |> should equal true
